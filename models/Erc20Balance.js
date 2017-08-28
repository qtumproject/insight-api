const mongoose = require('mongoose');

const erc20BalanceSchema = new mongoose.Schema({
    contract_address: {
        type: String,
        required: true
    },
    address_eth: {
        type: String
    },
    address: {
        type: String
    },
    amount: {
        type: String
    }
}, {
    timestamps: {
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    }
});

const Erc20Balance = mongoose.model('Erc20Balance', erc20BalanceSchema);

module.exports = Erc20Balance;