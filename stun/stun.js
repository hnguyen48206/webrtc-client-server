var Turn = require('node-turn');

var server = new Turn({
  // set options
  authMech: 'long-term',
  credentials: {
    hnguyen48206: "123456"
  },
  debugLevel: 'ALL',
  listeningPort: 9001
});
server.start();