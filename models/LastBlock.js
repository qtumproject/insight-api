const mongoose = require('mongoose');

const lastBlockSchema = new mongoose.Schema({

    type: {
        type: String,
        required: true,
        unique : true,
        index: {unique: true}
    },

    last_block_number: {
        type: Number,
        required: true,
        default : 0
    }

}, {
    timestamps: {
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    }
});

const LastBlock = mongoose.model('LastBlock', lastBlockSchema);

module.exports = LastBlock;