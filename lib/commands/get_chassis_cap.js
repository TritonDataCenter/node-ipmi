/* vim: set ts=8 sts=8 sw=8 noet: */

var mod_assert = require('assert-plus');

var lib_ipmi = require('../ipmi');

module.exports = function () {
	return ({
		cmd_name: 'get_chassis_cap',
		cmd_code: 0x00,
		cmd_netfn: 'chassis',
		cmd_encoder: encode_get_chassis_cap,
		cmd_decoder: decode_get_chassis_cap,
		cmd_desc: 'Get Chassis Capabilities',
		cmd_cc_extra: null,
	});
};

function
encode_get_chassis_cap(type, extra, buf)
{
	mod_assert.strictEqual(type, 'req');

	var datalen = 0;

	if (buf === null) {
		return (datalen);
	}
	mod_assert.ok(Buffer.isBuffer(buf));
	mod_assert.strictEqual(buf.length, datalen);

	return (datalen);
}

function
decode_get_chassis_cap(buf)
{
	var have_devaddr = false;

	if (buf.length === 6) {
		have_devaddr = true;
	} else {
		mod_assert.strictEqual(buf.length, 5);
	}

	var ccap = {
		ccap_capabilities: [],
		ccap_addr_fruinfo: buf.readUInt8(1),
		ccap_addr_sdr: buf.readUInt8(2),
		ccap_addr_sel: buf.readUInt8(3),
		ccap_addr_sysmgmt: buf.readUInt8(4),
		ccap_addr_bridge: have_devaddr ? buf.readUInt8(5) : null,
	};

	lib_ipmi.bits_decode_array({
		'power': 0x8,
		'diag': 0x4,
		'lockout': 0x2,
		'intrusion': 0x1,
	}, buf.readUInt8(0), ccap.ccap_capabilities);

	return (ccap);
}
