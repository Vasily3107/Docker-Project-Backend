const mongoose = require('mongoose');

const connection_string = 'mongodb+srv://admin:admin@cluster0.5ivypqw.mongodb.net/?appName=Cluster0'

mongoose.connect(connection_string)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('Could not connect to MongoDB', err));



const userSchema = new mongoose.Schema({
    name: String,
    password: String,
    role: { type: String, enum: ['user', 'admin'], default: 'user' }
});
const User = mongoose.model('User', userSchema);

const productSchema = new mongoose.Schema({
    title: String,
    price: Number,
    in_stock: { type: Boolean, default: true },
    img: String
});
const Product = mongoose.model('Product', productSchema);

const orderSchema = new mongoose.Schema({
    user_id: String,
    product_id: String,
    status: { type: String, enum: ['pending', 'paid', 'cancelled', 'shipped'], default: 'pending' },
    date: { type: Date, default: Date.now }
});
const Order = mongoose.model('Order', orderSchema);



module.exports = {
    User,
    Product,
    Order
}