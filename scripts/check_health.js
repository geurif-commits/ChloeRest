const http = require('http');
const url = process.argv[2] || 'http://localhost:3000/api/health';

function check(u) {
  const req = http.get(u, (res) => {
    let body = '';
    res.setEncoding('utf8');
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
      console.log('STATUS', res.statusCode);
      try { console.log('BODY', JSON.parse(body)); } catch (e) { console.log('BODY', body); }
      process.exit(res.statusCode === 200 ? 0 : 2);
    });
  });
  req.on('error', (err) => { console.error('ERROR', err.message); process.exit(3); });
  req.setTimeout(5000, () => { console.error('ERROR timeout'); req.destroy(); process.exit(4); });
}

check(url);
