# 開発の進め方

`main` は検証済みの安定したコードを置くブランチです。新機能は `feature/*`、不具合修正は `fix/*` で作業し、Pull Requestで変更を確認します。

## 作業を始める

未コミットの変更がある場合は、上書きせず先に内容を確認してください。

```sh
git status
git switch main
git pull --ff-only origin main
git switch -c feature/weather
```

不具合修正なら `git switch -c fix/touch-selection` のようにブランチを作ります。

## 確認してPush

```sh
npm ci
npm run typecheck
npm test
npm run build
```

Windowsのバックエンド検証:

```powershell
.\.venv\Scripts\python -m pytest tests/test_api.py -q
```

Linux/macOSでは `.venv/bin/python -m pytest tests/test_api.py -q` を使います。

```sh
git diff
git status --short
git add <変更したファイル>
git diff --cached
git commit -m "feat: add weather integration"
git push -u origin feature/weather
gh pr create --base main
```

PushとPull RequestでCIが動きます。変更の目的、確認した内容、未検証の事項をPRへ記載し、CI結果を確認してからマージします。`main` への強制Pushは行いません。

## データと認証情報

DB・バックアップ・アップロード・ログ・`.env`・秘密鍵・管理者認証情報はコミットしません。設定例には `.env.example`、DB構造の変更には `backend/migrations/` を使います。

テストは合成データと使い捨てのDBを使います。スクリーンショットやDBを含む `artifacts/` はGit管理しません。テスト内のパターン入力は検証専用の固定値で、実際の利用者の認証情報ではありません。

`docs/PROJECT_SPEC.md` はプロジェクト所有者が管理する基準文書です。仕様変更は所有者へ提案し、現在のPhase・認証仕様・実装記録との違いを確認してください。
