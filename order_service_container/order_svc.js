const amqp = require('amqplib');
const url = require('./helpers/url.js');
const rmq_qs = require('./helpers/rabbitmq_queues.js');
const db = require('./helpers/db.js');

async function main() {
    const connection = await amqp.connect(url.rabbitmq);
    const channel = await connection.createChannel();

    const queue = rmq_qs.order_queue;
    await channel.assertQueue(queue, { durable: true, arguments: { 'x-queue-type': 'quorum' } });

    channel.consume(queue, async function reply(msg) {
        const req = JSON.parse(msg.content.toString());
        const res = {
            status: undefined,
            message: undefined,
            data: undefined
        };

        const req_body_check = () => {
            if (req.body) return true;
            res.status = 400;
            res.message = 'req.body not found';
            return false;
        }

        const locals = {};

        switch (req.route) {
            case 'get_order':
                if (!req_body_check()) break;
                if (!req.body.id) {
                    res.status = 400;
                    res.message = 'Missing id'
                    break;
                }
                res.status = 200;
                res.data = await db.Order.findById(req.body.id);
                break;


            case 'add_order':
                if (!req_body_check()) break;
                if (!req.body.user_id || !req.body.product_id) {
                    res.status = 400;
                    res.message = 'Missing user_id or product_id'
                    break;
                }
                await db.Order.create({ user_id: req.body.user_id, product_id: req.body.product_id });
                res.status = 200;
                res.message = 'Order created'
                break;


            case 'update_order':
                if (!req_body_check()) break;
                if (!req.body.id || !req.body.update) {
                    res.status = 400;
                    res.message = 'Missing id or update object'
                    break;
                }
                res.status = 200;
                res.data = await db.Order.findByIdAndUpdate(req.body.id, req.body.update);
                res.message = 'Order updated';
                break;


            case 'get_all_orders':
                res.status = 200;
                res.data = [];
                locals.orders = await db.Order.find();
                for (const order of locals.orders) {
                    res.data.push({
                        _id: order._id,
                        user: await db.User.findById(order.user_id).select('-password'),
                        order: await db.Product.findById(order.product_id),
                        status: order.status,
                        date: order.date
                    });
                }
                break;


            case 'get_all_orders_of_user':
                if (!req_body_check()) break;
                if (!req.body.id) {
                    res.status = 400;
                    res.message = 'Missing id'
                    break;
                }
                res.status = 200;
                res.data = [];
                locals.orders = await db.Order.find({ user_id: req.body.id });
                for (const order of locals.orders) {
                    res.data.push({
                        _id: order._id,
                        order: await db.Product.findById(order.product_id),
                        status: order.status,
                        date: order.date
                    });
                }
                break;


            case 'get_all_orders_of_product':
                if (!req_body_check()) break;
                if (!req.body.id) {
                    res.status = 400;
                    res.message = 'Missing id'
                    break;
                }
                res.status = 200;
                res.data = await db.Order.find({ product_id: req.body.id });
                break;


            default:
                res.status = 400;
                res.message = `ORDER SERVICE: Unknown route: ${req.route}`;
        }

        channel.sendToQueue(msg.properties.replyTo,
            Buffer.from(JSON.stringify(res)), {
            correlationId: msg.properties.correlationId
        });

        channel.ack(msg);
    }).then(() => {
        console.log('Order service running');
    });
}

main();