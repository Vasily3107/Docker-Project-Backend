const amqp = require('amqplib');
const url = require('./helpers/url.js');
const rmq_qs = require('./helpers/rabbitmq_queues.js');
const db = require('./helpers/db.js');

async function main() {
    const connection = await amqp.connect(url.rabbitmq);
    const channel = await connection.createChannel();

    const queue = rmq_qs.product_queue;
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
            case 'get_product':
                if (!req_body_check()) break;
                if (!req.body.id) {
                    res.status = 400;
                    res.message = 'Missing id'
                    break;
                }
                res.status = 200;
                res.data = await db.Product.findById(req.body.id);
                break;


            case 'add_product':
                if (!req_body_check()) break;
                if (!req.body.title || !req.body.price || !req.body.img) {
                    res.status = 400;
                    res.message = 'Missing title, price, or img'
                    break;
                }
                await db.Product.create({ title: req.body.title, price: req.body.price, img: req.body.img });
                res.status = 200;
                res.message = 'Product created'
                break;


            case 'update_product':
                if (!req_body_check()) break;
                if (!req.body.id || !req.body.update) {
                    res.status = 400;
                    res.message = 'Missing id or update object'
                    break;
                }
                res.status = 200;
                res.data = await db.Product.findByIdAndUpdate(req.body.id, req.body.update);
                res.message = 'Product updated';
                break;


            case 'delete_product':
                if (!req_body_check()) break;
                if (!req.body.id) {
                    res.status = 400;
                    res.message = 'Missing id'
                    break;
                }
                res.status = 200;
                res.data = await db.Product.findByIdAndDelete(req.body.id);
                res.message = 'Product deleted';
                await db.Order.deleteMany({ product_id: req.body.id });
                break;


            case 'get_all_products':
                res.status = 200;
                res.data = await db.Product.find();
                break;


            default:
                res.status = 400;
                res.message = `PRODUCT SERVICE: Unknown route: ${req.route}`;
        }

        channel.sendToQueue(msg.properties.replyTo,
            Buffer.from(JSON.stringify(res)), {
            correlationId: msg.properties.correlationId
        });

        channel.ack(msg);
    }).then(() => {
        console.log('Product service running');
    });
}

main();