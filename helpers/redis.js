const { createClient } = require('redis');

const redis = createClient({ url: require('./url.js').redis });

redis.on('error', (err) => console.log('Redis error: ', err));
(async () => {
    await redis.connect();
    console.log('Connected to Redis');
})();

module.exports = redis;
module.exports.default = redis;