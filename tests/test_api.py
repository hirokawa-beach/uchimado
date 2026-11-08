import sqlite3
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from backend.main import create_app
from backend import db as models
from backend.security import ADMIN_COOKIE, ADMIN_TTL, credential, digest, normalize_pattern, verify_pattern

HEADERS = {"X-Uchimado": "1"}
PATTERN = [0, 1, 4, 7]
OTHER = [2, 1, 4, 8]
WRONG = [6, 3, 0, 1]


@pytest.fixture
def app(tmp_path):
    return create_app(tmp_path / "test.sqlite3")


@pytest.fixture
def client(app):
    with TestClient(app, base_url="http://localhost", client=("127.0.0.1", 12345), headers=HEADERS) as client:
        yield client


@pytest.fixture
def admin(client):
    result = client.post('/api/admin/setup', json={"pattern":PATTERN,"confirmation":PATTERN,"family_name":"家族"})
    assert result.status_code == 200, result.text
    client.recovery = result.json()['recoveryCode']
    return client


def event(**patch):
    return {"title":"予定","date":"2026-11-08","endDate":"2026-11-08","start":"09:00","end":"10:00","member":"家族",**patch}


def create(client, kind="events", data=None, headers=None):
    result=client.post(f'/api/records/{kind}',json={"data":data or event()},headers=headers)
    assert result.status_code==200,result.text
    return result.json()


def data_of(record):
    return {k:v for k,v in record.items() if k not in {'id','version','createdBy','updatedAt','calendarId','exceptions'}}


def unlock(client, pattern=PATTERN):
    return client.post('/api/admin/unlock',json={"pattern":pattern})


def profile(admin,name='はると'):
    result=admin.post('/api/admin/profiles',json={"name":name})
    assert result.status_code==200,result.text
    return result.json()


def test_family_access_without_login_or_admin_setup(client):
    info=client.get('/api/session').json()
    assert info['setupRequired'] and info['user']['role']=='family'
    assert client.get('/api/state').status_code==200
    assert client.get('/api/preferences/wall').status_code==200
    create(client)
    create(client,'tasks',{"title":"買い物"})
    create(client,'memos',{"text":"連絡"})
    assert client.get('/api/session').json()['user']['role']=='family'
    assert client.post('/api/login',json={"username":"admin","password":"old-password"}).status_code==404
    assert client.post('/api/setup',json={}).status_code==404
    assert client.get('/api/users').status_code==404


@pytest.mark.parametrize('method,url,body',[
    ('get','/api/admin/backup',None),
    ('post','/api/admin/profiles',{"name":"あや"}),
    ('put','/api/admin/profiles/unknown',{"version":1,"data":{"name":"あや"}}),
    ('put','/api/admin/family',{"name":"変更"}),
    ('post','/api/admin/pattern',{"pattern":OTHER,"confirmation":OTHER,"current_pattern":PATTERN}),
])
def test_management_api_requires_admin(client,method,url,body):
    kwargs={"headers":{"X-Uchimado-Profile":"administrator","X-Role":"admin"}}
    if body is not None:kwargs['json']=body
    assert getattr(client,method)(url,**kwargs).status_code==403


def test_single_admin_hashes_cookie_expiry_and_lock(admin,app):
    code=admin.recovery;token=admin.cookies.get(ADMIN_COOKIE)
    with app.state.Session() as db:
        record=credential(db)
        assert record.pattern_hash.startswith('scrypt-v1$')
        assert verify_pattern(PATTERN,record.pattern_hash)
        assert record.recovery_hash!=code and code not in record.recovery_hash
        assert db.get(models.AdminSession,token) is None
        session=db.get(models.AdminSession,digest(token))
        assert 0<session.expires-time.time()<=ADMIN_TTL
        assert db.scalar(select(models.AdminCredential.id))=='administrator'
    assert admin.post('/api/admin/setup',json={"pattern":PATTERN,"confirmation":PATTERN}).status_code==409
    response=unlock(admin)
    cookie=response.headers['set-cookie'].lower()
    assert 'httponly' in cookie and 'samesite=strict' in cookie and 'max-age=900' in cookie
    token=admin.cookies.get(ADMIN_COOKIE)
    assert admin.post('/api/admin/lock').status_code==200
    admin.cookies.set(ADMIN_COOKIE,token)
    assert admin.get('/api/admin/backup').status_code==403
    assert admin.get('/api/state').status_code==200


def test_admin_session_expiry_is_server_enforced(admin,app):
    with app.state.Session() as db:
        db.get(models.AdminSession,digest(admin.cookies.get(ADMIN_COOKIE))).expires=time.time()-1
        db.commit()
    assert admin.get('/api/session').json()['user']['role']=='family'
    assert admin.get('/api/admin/backup').status_code==403
    assert admin.post('/api/admin/profiles',json={"name":"侵入"}).status_code==403
    create(admin,'memos',{"text":"通常利用は継続"})


def test_setup_localhost_only_and_csrf(app):
    payload={"pattern":PATTERN,"confirmation":PATTERN}
    with TestClient(app,base_url='http://localhost',client=('192.168.1.10',1),headers=HEADERS) as remote:
        assert not remote.get('/api/session').json()['canSetup']
        assert remote.post('/api/admin/setup',json=payload).status_code==403
    with TestClient(app,base_url='http://localhost',client=('127.0.0.1',1),headers=HEADERS) as local:
        assert local.post('/api/admin/setup',json=payload,headers={"X-Uchimado":"0"}).status_code==403
        assert local.post('/api/admin/setup',json=payload,headers={"Origin":"https://evil.example"}).status_code==403
        assert local.post('/api/admin/setup',json=payload).status_code==200
        assert local.get('/api/session').headers['cache-control']=='no-store'


def test_pattern_input_validation_and_midpoints(client):
    assert normalize_pattern([0,2,8])==[0,1,2,5,8]
    for invalid in ([0,1,1,4],[0,1,2],[-1,2,4,8],[True,1,4,7],['0',1,4,7]):
        assert client.post('/api/admin/unlock',json={"pattern":invalid}).status_code==422
    assert client.post('/api/admin/setup',json={"pattern":PATTERN,"confirmation":OTHER}).status_code==422


def test_profile_selection_is_attribution_not_authentication(admin,app):
    p=profile(admin)
    assert set(p)=={'id','name','active','version'}
    with app.state.engine.connect() as conn:
        columns=[row[1] for row in conn.exec_driver_sql('PRAGMA table_info(profiles)')]
        assert 'password_hash' not in columns and 'pattern_hash' not in columns
    admin.post('/api/admin/lock')
    admin.headers['X-Uchimado-Profile']=p['id']
    info=admin.get('/api/session').json()['user']
    assert info['id']==p['id'] and info['role']=='family'
    created=create(admin,'memos',{"text":"プロフィール付き"})
    assert created['createdBy']==p['id']
    assert admin.get('/api/admin/backup').status_code==403
    admin.headers['X-Uchimado-Profile']='unknown-profile'
    assert admin.get('/api/session').json()['user']['id'] is None
    assert unlock(admin).status_code==200
    admin.headers['X-Uchimado-Profile']=p['id']
    assert admin.get('/api/session').json()['user']['role']=='admin'
    admin.headers['X-Uchimado-Profile']=''
    assert admin.get('/api/session').json()['user']['role']=='admin'


def test_profile_management_versions_attribution_and_archiving(admin):
    p=profile(admin)
    assert admin.post('/api/admin/profiles',json={"name":"はると"}).status_code==409
    assert admin.post('/api/admin/profiles',json={"name":"ゆい","password":"unused"}).status_code==422
    task=create(admin,'tasks',{"title":"買い物","memberId":p['id']})
    assert task['member']=='はると'
    assert admin.put(f"/api/admin/profiles/{p['id']}",json={"version":1,"data":{"name":"ハルト","active":True}}).status_code==200
    assert admin.get('/api/state').json()['tasks'][0]['member']=='ハルト'
    assert admin.put(f"/api/admin/profiles/{p['id']}",json={"version":1,"data":{"name":"古い変更"}}).status_code==409
    assert admin.put(f"/api/admin/profiles/{p['id']}",json={"version":2,"data":{"name":"ハルト","active":False}}).status_code==200
    assert not admin.get('/api/state').json()['members'][0]['active']
    admin.headers['X-Uchimado-Profile']=p['id']
    assert admin.get('/api/session').json()['user']['id'] is None
    assert admin.post('/api/records/tasks',json={"data":{"title":"新規","memberId":p['id']}}).status_code==422


def test_private_data_cannot_be_opened_by_profile_or_admin(admin,app):
    p=profile(admin)
    # Seed a legacy private record without creating a new password-based account.
    with app.state.Session() as db:
        user=models.User(id=p['id'],username='legacy-only',name='以前のユーザー',password_hash='disabled')
        db.add(user);db.flush()
        private=models.Memo(family_id='home',owner_id=user.id,created_by=user.id,data={"text":"非公開の秘密","visibility":"private","pinned":False,"title":""})
        db.add(private);db.commit();record_id=private.id
    for header in ('',p['id'],'administrator'):
        admin.headers['X-Uchimado-Profile']=header
        assert admin.get('/api/state').json()['memos']==[]
        assert admin.get(f'/api/history/memos/{record_id}').status_code==404
        assert admin.put(f'/api/records/memos/{record_id}',json={"version":1,"data":{"text":"開く"}}).status_code==404
        assert admin.delete(f'/api/records/memos/{record_id}?version=1').status_code==404
    assert admin.post('/api/records/memos',json={"data":{"text":"秘密","visibility":"private"}}).status_code==422


def test_global_pattern_throttle_persists_across_restart_and_source(admin,app):
    for _ in range(5):assert unlock(admin,WRONG).status_code==401
    assert unlock(admin).status_code==429
    other=create_app(app.state.db_path)
    with TestClient(other,base_url='http://localhost',client=('192.168.1.20',1),headers=HEADERS) as remote:
        response=unlock(remote)
        assert response.status_code==429 and int(response.headers['Retry-After'])>0


def test_one_use_recovery_revokes_all_sessions_without_auto_unlock(admin,app):
    token=admin.cookies.get(ADMIN_COOKIE);code=admin.recovery
    for _ in range(5):unlock(admin,WRONG)
    response=admin.post('/api/admin/recover',json={"recovery_code":code,"pattern":OTHER,"confirmation":OTHER})
    assert response.status_code==200
    replacement=response.json()['recoveryCode'];assert replacement!=code
    assert admin.get('/api/session').json()['user']['role']=='family'
    admin.cookies.set(ADMIN_COOKIE,token)
    assert admin.get('/api/admin/backup').status_code==403
    assert admin.post('/api/admin/recover',json={"recovery_code":code,"pattern":PATTERN,"confirmation":PATTERN}).status_code==401
    assert unlock(admin,OTHER).status_code==200
    assert admin.post('/api/admin/recover',json={"recovery_code":replacement,"pattern":PATTERN,"confirmation":PATTERN}).status_code==200
    with app.state.Session() as db:
        for row in db.scalars(select(models.Audit)):
            assert code not in str(row.before)+str(row.after)


def test_recovery_attempt_limit(admin):
    payload={"recovery_code":"0"*48,"pattern":OTHER,"confirmation":OTHER}
    for _ in range(3):assert admin.post('/api/admin/recover',json=payload).status_code==401
    assert admin.post('/api/admin/recover',json=payload).status_code==429


def test_pattern_change_requires_current_pattern_and_revokes_sessions(admin,app):
    with TestClient(app,base_url='http://localhost',headers=HEADERS) as second:
        assert unlock(second).status_code==200
        assert admin.post('/api/admin/pattern',json={"current_pattern":WRONG,"pattern":OTHER,"confirmation":OTHER}).status_code==401
        assert admin.post('/api/admin/pattern',json={"current_pattern":PATTERN,"pattern":OTHER,"confirmation":OTHER}).status_code==200
        assert admin.get('/api/admin/backup').status_code==403
        assert second.get('/api/admin/backup').status_code==403
        assert unlock(second,PATTERN).status_code==401
        assert unlock(second,OTHER).status_code==200


def test_crud_conflict_validation_and_history(client,app):
    record=create(client);uri=f"/api/records/events/{record['id']}"
    response=client.put(uri,json={"version":1,"data":event(title='変更')})
    assert response.status_code==200 and response.json()['version']==2
    assert client.put(uri,json={"version":1,"data":event()}).status_code==409
    assert client.put(uri,json={"data":event()}).status_code==428
    assert client.delete(uri+'?version=1').status_code==409
    assert client.post('/api/records/events',json={"data":event(end='08:00')}).status_code==422
    assert len(client.get(f"/api/history/events/{record['id']}").json())==2
    assert client.delete(uri+'?version=2').status_code==200
    assert client.get('/api/state').json()['events']==[]


def test_recurring_events_single_occurrence_and_series(client):
    record=create(client,data=event(recurrence={"frequency":"weekly","until":"2026-12-01"}))
    url=f"/api/events/{record['id']}/occurrences/2026-11-15"
    assert client.put(url,json={"version":1,"data":event(date='2026-11-16',endDate='2026-11-16')}).status_code==200
    values=client.get('/api/events/occurrences?begin=2026-11-08&end=2026-11-30').json()
    assert sorted(v['date'] for v in values)==['2026-11-08','2026-11-16','2026-11-22','2026-11-29']
    assert client.put(url,json={"version":2,"data":{},"cancelled":True}).status_code==200
    assert len(client.get('/api/events/occurrences?begin=2026-11-08&end=2026-11-30').json())==3
    assert client.put(f"/api/records/events/{record['id']}",json={"version":3,"data":data_of(record)}).status_code==200
    assert len(client.get('/api/events/occurrences?begin=2026-11-08&end=2026-11-30').json())==4


def test_monthly_all_day_and_task_completions(client):
    create(client,data=event(date='2026-01-31',endDate='2026-01-31',allDay=True,start='00:00',end='00:00',recurrence={"frequency":"monthly"}))
    assert [v['date'] for v in client.get('/api/events/occurrences?begin=2026-01-01&end=2026-04-30').json()]==['2026-01-31','2026-03-31']
    task=create(client,'tasks',{"title":"ごみ出し","due":"2026-11-08","recurrence":{"frequency":"weekly","until":"2026-11-15"}})
    uri=f"/api/records/tasks/{task['id']}"
    value=client.put(uri,json={"version":1,"data":data_of(task)|{"done":True}}).json()
    assert not value['done'] and value['due']=='2026-11-15'
    assert client.put(uri,json={"version":1,"data":data_of(task)|{"done":True}}).status_code==409
    assert len(client.get('/api/state').json()['completions'])==1


def test_home_preferences_can_be_changed_without_admin(client):
    layout={"widgets":[{"id":"clock","size":"standard","x":1,"y":1}]}
    assert client.get('/api/session').json()['user']['role']=='family'
    assert client.put('/api/preferences/wall/layout',json={"data":layout}).status_code==200
    assert client.put('/api/preferences/wall/layout',json={"data":layout}).status_code==428
    assert client.put('/api/preferences/wall/layout',json={"version":1,"data":{"widgets":[]}}).status_code==200
    overlap={"widgets":[{"id":"clock","size":"standard","x":1,"y":1},{"id":"weather","size":"standard","x":2,"y":1}]}
    assert client.put('/api/preferences/wall/layout',json={"version":2,"data":overlap}).status_code==422
    assert client.put('/api/preferences/wall/settings',json={"data":{"theme":"dark"}}).status_code==200
    assert client.get('/api/preferences/wall').json()['settings']['theme']=='dark'
    assert client.put('/api/preferences/wall/settings',json={"version":1,"data":{"theme":"light"}}).status_code==200
    assert client.put('/api/preferences/wall/settings',json={"version":1,"data":{"theme":"dark"}}).status_code==409
    assert client.put('/api/preferences/wall/settings',json={"version":2,"data":{"family_name":"変更"}}).status_code==422
    assert client.get('/api/preferences/mobile').json()['layout'] is None
    assert client.get('/api/admin/backup').status_code==403
    assert client.put('/api/admin/family',json={"name":"変更"}).status_code==403


def test_public_websocket_invalidation_and_origin(client,app):
    from starlette.websockets import WebSocketDisconnect
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect('ws://localhost/api/ws',headers={"Origin":"https://evil.example"}):pass
    with client.websocket_connect('ws://localhost/api/ws',headers={"Origin":"http://localhost"}) as ws:
        assert ws.receive_json()['type']=='ready'
        create(client,'memos',{"text":"通知"})
        assert ws.receive_json()=={"type":"changed"}
        # Locking administrator access does not log out ordinary family use.
        client.post('/api/admin/lock')
        create(client,'memos',{"text":"通常利用を継続"})
        assert ws.receive_json()['type']=='changed'


def test_backup_restart_and_offline_restore_keep_current_credentials(admin,app,tmp_path,monkeypatch):
    from backend.manage import main
    import sys
    record=create(admin)
    backup=admin.get('/api/admin/backup')
    assert backup.status_code==200 and backup.content.startswith(b'SQLite format 3')
    target=tmp_path/'backup.sqlite3';target.write_bytes(backup.content)
    with sqlite3.connect(target) as db:assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
    changed=admin.post('/api/admin/pattern',json={"current_pattern":PATTERN,"pattern":OTHER,"confirmation":OTHER}).json()
    assert unlock(admin,OTHER).status_code==200
    create(admin,'memos',{"text":"復元前"})
    monkeypatch.setenv('UCHIMADO_DB',str(app.state.db_path));monkeypatch.setattr(sys,'argv',['manage','restore',str(target),'--server-stopped'])
    monkeypatch.setattr('backend.manage.getpass.getpass',lambda _:''.join(str(n+1) for n in OTHER))
    main()
    assert admin.get('/api/admin/backup').status_code==403
    assert admin.get('/api/state').json()['memos']==[]
    assert admin.get('/api/state').json()['events'][0]['id']==record['id']
    assert unlock(admin,PATTERN).status_code==401
    assert unlock(admin,OTHER).status_code==200
    assert admin.post('/api/admin/recover',json={"recovery_code":admin.recovery,"pattern":PATTERN,"confirmation":PATTERN}).status_code==401
    assert admin.post('/api/admin/recover',json={"recovery_code":changed['recoveryCode'],"pattern":PATTERN,"confirmation":PATTERN}).status_code==200
    assert list(tmp_path.glob('before-restore-*.sqlite3'))
    other=create_app(app.state.db_path)
    with TestClient(other,base_url='http://localhost',headers=HEADERS) as restarted:
        assert not restarted.get('/api/session').json()['setupRequired']
        assert restarted.get('/api/state').json()['events'][0]['id']==record['id']


def test_local_emergency_recovery_requires_stopped_server(admin,app,monkeypatch,capsys):
    from backend.manage import main
    import sys
    monkeypatch.setenv('UCHIMADO_DB',str(app.state.db_path));monkeypatch.setattr(sys,'argv',['manage','issue-admin-recovery'])
    with pytest.raises(SystemExit):main()
    monkeypatch.setattr(sys,'argv',['manage','issue-admin-recovery','--server-stopped'])
    main()
    output=capsys.readouterr().out
    code=output.split('offline): ')[1].splitlines()[0]
    assert admin.get('/api/admin/backup').status_code==403
    assert admin.post('/api/admin/recover',json={"recovery_code":code,"pattern":OTHER,"confirmation":OTHER}).status_code==200


def test_legacy_migration_keeps_data_disables_passwords_and_seals_private(tmp_path):
    from alembic import command
    from alembic.config import Config
    from backend.schemas import EventData
    engine,Session,path=models.database(tmp_path/'legacy.sqlite3')
    config=Config(str(models.ROOT/'alembic.ini'));config.set_main_option('script_location',str(models.ROOT/'backend'/'migrations'))
    with engine.begin() as connection:
        config.attributes['connection']=connection;command.upgrade(config,'0001_core')
    with Session() as db:
        db.add(models.Family(id='home',name='既存家族'));db.flush()
        user=models.User(username='old-admin',name='旧メンバー',password_hash='legacy-hash');db.add(user);db.flush()
        db.add(models.Membership(family_id='home',user_id=user.id,role='admin'))
        calendar=models.Calendar(family_id='home',owner_id=None,name='家族');db.add(calendar);db.flush()
        shared=models.CalendarEvent(family_id='home',owner_id=None,calendar_id=calendar.id,created_by=user.id,data=EventData.model_validate(event(member=user.name)).model_dump(mode='json'))
        private=models.Memo(family_id='home',owner_id=user.id,created_by=user.id,data={"text":"秘密を保護","visibility":"private"})
        db.add_all([shared,private,models.LoginSession(id=digest('old-token'),family_id='home',user_id=user.id,expires=time.time()+900)])
        db.commit();user_id=user.id;shared_id=shared.id;private_id=private.id
    migrated=create_app(path)
    with TestClient(migrated,base_url='http://localhost',client=('127.0.0.1',1),headers=HEADERS) as client:
        client.cookies.set('uchimado_session','old-token');client.headers['X-Uchimado-Profile']=user_id
        state=client.get('/api/state').json()
        assert state['user']['role']=='family' and state['user']['id']==user_id
        assert state['events'][0]['id']==shared_id and state['events'][0]['memberId']==user_id
        assert state['events'][0]['createdBy']==user_id and state['memos']==[]
        assert client.get('/api/admin/backup').status_code==403
        assert client.post('/api/admin/setup',json={"pattern":PATTERN,"confirmation":PATTERN}).status_code==200
        assert client.get('/api/state').json()['memos']==[]
        with migrated.state.Session() as db:
            assert db.get(models.User,user_id).password_hash=='disabled-profile-migration'
            assert db.get(models.Memo,private_id).data['text']=='秘密を保護'
            assert list(db.scalars(select(models.LoginSession)))==[]
    assert list((tmp_path/'backups').glob('before-auth-v2-*.sqlite3'))


def test_per_record_author_does_not_select_identity_or_grant_admin(admin):
    person = profile(admin)
    admin.post('/api/admin/lock')
    for kind, data in [('events', event()), ('tasks', {'title':'やること'}), ('memos', {'text':'共有メモ'})]:
        result = admin.post(f'/api/records/{kind}', json={'profile_id':person['id'], 'data':data})
        assert result.status_code == 200, result.text
        assert result.json()['createdBy'] == person['id']
    session = admin.get('/api/session').json()['user']
    assert session['id'] is None and session['role'] == 'family'
    assert admin.get('/api/admin/backup').status_code == 403
    assert admin.get('/api/state').json()['user']['id'] is None


def test_per_record_author_rejects_missing_inactive_or_other_household(admin, app):
    person = profile(admin)
    with app.state.Session() as db:
        db.get(models.Profile, person['id']).active = False
        db.add(models.Family(id='other', name='別のボード'))
        db.add(models.Profile(id='outsider',family_id='other',name='別の人',active=True))
        db.commit()
    for author in ['missing', person['id'], 'outsider']:
        result = admin.post('/api/records/memos',json={'profile_id':author,'data':{'text':'共有'}})
        assert result.status_code == 422
    assert admin.get('/api/state').json()['memos'] == []
