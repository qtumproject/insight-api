var BigNumber = require('bignumber.js');

module.exports = {
    /**
     *
     * @param {Number} height
     * @return {BigNumber}
     */
    getTotalSupplyByHeight: function (height) {
        return (new BigNumber(100000000)).plus((height - 5000) * 4);
    },

    /**
     *
     * @param {Number} height
     * @return {BigNumber}
     */
    getPOSTotalSupplyByHeight: function (height) {
        return new BigNumber((height - 5000) * 4);
    }
};