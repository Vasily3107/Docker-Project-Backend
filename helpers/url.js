const DEBUG_MODE = true;

let rabbitmq, redis;

if (DEBUG_MODE) {
    rabbitmq = 'amqp://localhost';
    redis = 'redis://localhost:6379';
} else {
    rabbitmq = 'amqp://rabbitmq';
    redis = 'redis://redis:6379';
}

const url = {
    rabbitmq,
    redis
};

module.exports = url;
module.exports.default = url;