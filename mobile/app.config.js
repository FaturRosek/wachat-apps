const os = require('os');

function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    if (/wsl|hyper-v|vethernet|virtual|docker|bluetooth|loopback/i.test(name)) {
      continue;
    }
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
}

module.exports = ({ config }) => {
  const lanIp = getLocalIpAddress();
  return {
    ...config,
    extra: {
      ...(config.extra || {}),
      backendHost: lanIp ? `http://${lanIp}:5000` : null,
      detectedIp: lanIp || null,
    },
  };
};
