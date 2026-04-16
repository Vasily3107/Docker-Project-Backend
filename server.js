const express = require('express');
const uuid = require('uuid');
const crypto = require('crypto');

const port = 3000;

const app = express();
app.use(require('cors')());
app.use(express.json({ limit: "10mb" }));

const url = require('./helpers/url.js');
const rmq_queues = require('./helpers/rabbitmq_queues.js');
const redis = require('./helpers/redis.js');

const amqp = require('amqplib');
let connection, channel;
(async () => {
    connection = await amqp.connect(url.rabbitmq);
    channel = await connection.createChannel();
})();

const reply_to_queues = {};
async function rabbitmq_send_recv(queue, reply_to, req) {
    const correlationId = uuid.v4();
    let consumer;
    const res = await new Promise((resolve) => {
        consumer = channel.consume(reply_to.queue, (msg) => {
            if (msg.properties.correlationId === correlationId) {
                resolve(JSON.parse(msg.content.toString()));
            }
        }, { noAck: true });
        channel.sendToQueue(queue,
            Buffer.from(JSON.stringify(req)), {
            correlationId: correlationId,
            replyTo: reply_to.queue
        });
    });
    consumer = await consumer;
    await channel.cancel(consumer.consumerTag);
    return res;
};
function sha256(input) {
    return crypto.createHash('sha256').update(input).digest('hex');
}


// ================================================================================================
//    USER ROUTES (NO ADMIN REQUIRED)
// ================================================================================================
app.post('/sign_up', async (req, res) => {
    try {
        const QUEUE = '/sign_up';
        if (!reply_to_queues[QUEUE])
            reply_to_queues[QUEUE] = await channel.assertQueue(uuid.v4(), { durable: false });

        if (req.body.password)
            req.body.password = sha256(req.body.password);

        const rmq_res = await rabbitmq_send_recv(rmq_queues.user_queue, reply_to_queues[QUEUE], {
            route: 'sign_up',
            body: req.body
        });

        if (rmq_res.status == 200)
            await redis.del('all_users');

        res.json(rmq_res);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
app.post('/log_in', async (req, res) => {
    try {
        const QUEUE = '/log_in';
        if (!reply_to_queues[QUEUE])
            reply_to_queues[QUEUE] = await channel.assertQueue(uuid.v4(), { durable: false });

        if (req.body.password)
            req.body.password = sha256(req.body.password);

        const rmq_res = await rabbitmq_send_recv(rmq_queues.user_queue, reply_to_queues[QUEUE], {
            route: 'log_in',
            body: req.body
        });

        res.json(rmq_res);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
app.post('/users', async (req, res) => {
    try {
        const QUEUE = '/users';
        if (!reply_to_queues[QUEUE])
            reply_to_queues[QUEUE] = await channel.assertQueue(uuid.v4(), { durable: false });

        const id = req.body?.id;

        const all_users = JSON.parse(await redis.get('all_users'));
        if (all_users != null) {
            if (id) {
                const user = all_users.find(i => i._id == id);
                if (user) return res.status(200).json({ message: 'Redis cache hit', data: user });
            }
            else
                return res.status(200).json({ message: 'Redis cache hit', data: all_users });
        }

        const rmq_res = await rabbitmq_send_recv(rmq_queues.user_queue, reply_to_queues[QUEUE], {
            route: id ? 'get_user' : 'get_all_users',
            body: { id: id }
        });

        if (!id) await redis.set('all_users', JSON.stringify(rmq_res.data));

        res.json(rmq_res);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
app.post('/products', async (req, res) => {
    try {
        const QUEUE = '/products';
        if (!reply_to_queues[QUEUE])
            reply_to_queues[QUEUE] = await channel.assertQueue(uuid.v4(), { durable: false });

        const id = req.body?.id;

        const all_products = JSON.parse(await redis.get('all_products'));
        if (all_products != null) {
            if (id) {
                const product = all_products.find(i => i._id == id);
                if (product) return res.status(200).json({ message: 'Redis cache hit', data: product });
            }
            else
                return res.status(200).json({ message: 'Redis cache hit', data: all_products });
        }

        const rmq_res = await rabbitmq_send_recv(rmq_queues.product_queue, reply_to_queues[QUEUE], {
            route: id ? 'get_product' : 'get_all_products',
            body: { id: id }
        });

        if (!id) await redis.set('all_products', JSON.stringify(rmq_res.data));

        res.json(rmq_res);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
app.post('/orders', async (req, res) => {
    try {
        const QUEUE = '/orders';
        if (!reply_to_queues[QUEUE])
            reply_to_queues[QUEUE] = await channel.assertQueue(uuid.v4(), { durable: false });

        let filter = undefined;
        let filter_value = undefined;
        let route = 'get_all_orders';

        if (req.body?.id) {
            route = 'get_order'
            filter = '_id';
            filter_value = req.body.id;
        } else if (req.body?.user_id) {
            route = 'get_all_orders_of_user'
            filter = 'user_id';
            filter_value = req.body.user_id;
        } else if (req.body?.product_id) {
            route = 'get_all_orders_of_product'
            filter = 'product_id';
            filter_value = req.body.product_id;
        }

        const all_orders = JSON.parse(await redis.get('all_orders'));
        if (all_orders != null) {
            if (filter) {
                const order = all_orders.find(i => i[filter] == filter_value);
                if (order) return res.status(200).json({ message: 'Redis cache hit', data: order });
            }
            else
                return res.status(200).json({ message: 'Redis cache hit', data: all_orders });
        }

        const rmq_res = await rabbitmq_send_recv(rmq_queues.order_queue, reply_to_queues[QUEUE], {
            route: route,
            body: { id: filter_value }
        });

        if (!filter) await redis.set('all_orders', JSON.stringify(rmq_res.data));

        res.json(rmq_res);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
app.post('/add_order', async (req, res) => {
    try {
        const QUEUE = '/add_order';
        if (!reply_to_queues[QUEUE])
            reply_to_queues[QUEUE] = await channel.assertQueue(uuid.v4(), { durable: false });

        if (req.body.password)
            req.body.password = sha256(req.body.password);

        const rmq_res = await rabbitmq_send_recv(rmq_queues.order_queue, reply_to_queues[QUEUE], {
            route: 'add_order',
            body: req.body
        });

        if (rmq_res.status == 200) await redis.del('all_orders');

        res.json(rmq_res);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
app.post('/update_order', async (req, res) => {
    try {
        const QUEUE = '/update_order';
        if (!reply_to_queues[QUEUE])
            reply_to_queues[QUEUE] = await channel.assertQueue(uuid.v4(), { durable: false });

        if (req.body.password)
            req.body.password = sha256(req.body.password);

        const rmq_res = await rabbitmq_send_recv(rmq_queues.order_queue, reply_to_queues[QUEUE], {
            route: 'update_order',
            body: req.body
        });

        if (rmq_res.status == 200) await redis.del('all_orders');

        res.json(rmq_res);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});


// ================================================================================================
//    ADMIN ROUTES
// ================================================================================================
app.post('/admin/add_product', async (req, res) => {
    try {
        const QUEUE = '/admin/add_product';
        if (!reply_to_queues[QUEUE])
            reply_to_queues[QUEUE] = await channel.assertQueue(uuid.v4(), { durable: false });

        if (req.body.password)
            req.body.password = sha256(req.body.password);

        const res_is_admin = await rabbitmq_send_recv(rmq_queues.user_queue, reply_to_queues[QUEUE], {
            route: 'is_admin',
            body: req.body
        });
        if (res_is_admin.status == 400)
            return res.json({ message: res_is_admin.message, status: 400 });
        if (!res_is_admin.data.is_admin)
            return res.json({ message: 'Access denied', status: 400 });

        const rmq_res = await rabbitmq_send_recv(rmq_queues.product_queue, reply_to_queues[QUEUE], {
            route: 'add_product',
            body: req.body
        });

        if (rmq_res.status == 200)
            await redis.del('all_products');

        res.json(rmq_res);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
app.post('/admin/update_product', async (req, res) => {
    try {
        const QUEUE = '/admin/update_product';
        if (!reply_to_queues[QUEUE])
            reply_to_queues[QUEUE] = await channel.assertQueue(uuid.v4(), { durable: false });

        if (req.body.password)
            req.body.password = sha256(req.body.password);

        const res_is_admin = await rabbitmq_send_recv(rmq_queues.user_queue, reply_to_queues[QUEUE], {
            route: 'is_admin',
            body: req.body
        });
        if (res_is_admin.status == 400)
            return res.json({ message: res_is_admin.message, status: 400 });
        if (!res_is_admin.data.is_admin)
            return res.json({ message: 'Access denied', status: 400 });

        const rmq_res = await rabbitmq_send_recv(rmq_queues.product_queue, reply_to_queues[QUEUE], {
            route: 'update_product',
            body: req.body
        });

        if (rmq_res.status == 200)
            await redis.del('all_products');

        res.json(rmq_res);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
app.post('/admin/delete_product', async (req, res) => {
    try {
        const QUEUE = '/admin/delete_product';
        if (!reply_to_queues[QUEUE])
            reply_to_queues[QUEUE] = await channel.assertQueue(uuid.v4(), { durable: false });

        if (req.body.password)
            req.body.password = sha256(req.body.password);

        const res_is_admin = await rabbitmq_send_recv(rmq_queues.user_queue, reply_to_queues[QUEUE], {
            route: 'is_admin',
            body: req.body
        });
        if (res_is_admin.status == 400)
            return res.json({ message: res_is_admin.message, status: 400 });
        if (!res_is_admin.data.is_admin)
            return res.json({ message: 'Access denied', status: 400 });

        const rmq_res = await rabbitmq_send_recv(rmq_queues.product_queue, reply_to_queues[QUEUE], {
            route: 'delete_product',
            body: req.body
        });

        if (rmq_res.status == 200)
            await redis.del('all_products');

        res.json(rmq_res);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});


// ================================================================================================
//    DEBUG ROUTES
// ================================================================================================
app.get('/reset_redis', async (req, res) => {
    try {
        await redis.flushAll();
        res.sendStatus(200);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});


app.listen(port, '0.0.0.0', () => {
    console.log(`Main API running on port ${port}`);
});