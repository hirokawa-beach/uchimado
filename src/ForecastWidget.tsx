import { Cloud, CloudRain, CloudSun, Droplets, MapPin, Sun, Wind } from 'lucide-react'
import { addDays, dateKey, jaDate } from './model'

// Offline prototype: the current conditions and the first daily forecast share one source.
const forecast = [
  { condition: '晴れ時々くもり', icon: CloudSun, high: 20, low: 12, rain: 10 },
  { condition: '晴れ', icon: Sun, high: 21, low: 13, rain: 10 },
  { condition: 'くもり', icon: Cloud, high: 19, low: 14, rain: 30 },
  { condition: '雨', icon: CloudRain, high: 17, low: 13, rain: 80 },
  { condition: '晴れ時々くもり', icon: CloudSun, high: 20, low: 12, rain: 20 },
]
const current = { temperature: 18, condition: forecast[0].condition, wind: '北東 2m/s' }

export default function ForecastWidget({ now }: { now: Date }) {
  return <div className="forecast-content">
    <section className="forecast-now" aria-label="現在の天気">
      <div className="forecast-location"><MapPin size={19} aria-hidden="true"/><strong>神戸市</strong><span>いま</span><small>サンプル</small></div>
      <div className="forecast-current"><strong>{current.temperature}<span>°</span></strong><CloudSun size={82} strokeWidth={1.5} aria-hidden="true"/></div>
      <p className="forecast-condition">{current.condition}</p>
      <div className="forecast-highlow"><span>最高 <b>{forecast[0].high}°</b></span><span>最低 <b>{forecast[0].low}°</b></span></div>
      <div className="forecast-facts"><span><Droplets size={18} aria-hidden="true"/>降水 {forecast[0].rain}%</span><span><Wind size={18} aria-hidden="true"/>{current.wind}</span></div>
    </section>
    <ol className="forecast-days" aria-label="今日から5日間の天気予報">
      {forecast.map((day, i) => {
        const date = addDays(now, i), Icon = day.icon
        return <li className="forecast-day" key={dateKey(date)}>
          <time dateTime={dateKey(date)}><strong>{i===0?'今日':i===1?'明日':jaDate(date,{weekday:'short'})}</strong><span>{jaDate(date,{month:'numeric',day:'numeric'})}</span></time>
          <Icon className="forecast-day-icon" size={46} strokeWidth={1.6} aria-hidden="true"/>
          <span className="forecast-day-condition">{day.condition}</span>
          <div className="forecast-day-temperatures"><b aria-label={`最高${day.high}度`}>{day.high}°</b><span aria-label={`最低${day.low}度`}>{day.low}°</span></div>
          <span className="forecast-day-rain"><Droplets size={16} aria-hidden="true"/><span aria-label={`降水確率${day.rain}パーセント`}>{day.rain}%</span></span>
        </li>
      })}
    </ol>
  </div>
}
