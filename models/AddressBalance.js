const mongoose = require('mongoose');

const addressBalanceSchema = new mongoose.Schema({
    address: {
        type: String,
        required: true,
        index: true
    },
    balance: {
        type: Number,
        required: true,
        index: true
    }
}, {
    timestamps: {
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    }
});

const AddressBalance = mongoose.model('AddressBalance', addressBalanceSchema);

module.exports = AddressBalance;