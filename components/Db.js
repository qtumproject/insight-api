const mongoose = require('mongoose');
const Common = require('../lib/common');

function Db(node, config) {
    this.config = config;
    this.node = node;
    this.common = new Common({log: this.node.log});
}

Db.prototype.connect = function (cb) {

    var self = this,
        configDB = this.config,
        userUrl = (configDB['user']) ? (configDB['user'] + ':' + configDB['password'] + '@') : '',
        url = 'mongodb://' + userUrl + configDB['host'] + ':' + configDB['port'] + '/' + configDB['database'];

    return mongoose.connect(url, { useMongoClient: true }, function (err) {

        if (err) {
            self.common.log.error('[DB] ', err);
            return cb(err);
        }

        self.common.log.info('[DB] Connected');

        return cb();

    });

};

module.exports = Db;

