/* vim: set ts=8 sts=8 sw=8 noet: */

var mod_assert = require('assert-plus');

var lib_common = require('../common');

module.exports = function () {
	return ({
		cmd_name: 'get_chassis_status',
		cmd_code: 0x01,
		cmd_netfn: 'chassis',
		cmd_encoder: encode_get_chassis_status,
		cmd_decoder: decode_get_chassis_status,
		cmd_desc: 'Get Chassis Status',
		cmd_cc_extra: null,
	});
};

function
encode_get_chassis_status(type, extra, buf)
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
decode_get_chassis_status(buf)
{
	var have_front_panel = false;

	if (buf.length === 4) {
		have_front_panel = true;
	} else {
		mod_assert.strictEqual(buf.length, 3);
	}

	var csta = {
		csta_last_power_event: [],
	};

	lib_common.bits_decode_object({
		csta_power_on: 0x1,
		csta_power_overload: 0x2,
		csta_power_interlock: 0x4,
		csta_power_fault: 0x8,
		csta_power_control_fault: 0x10,
	}, buf.readUInt8(0), csta);

	lib_common.bits_decode_array({
		'ipmi_command': 0x10,
		'fault': 0x8,
		'interlock': 0x4,
		'overload': 0x2,
		'ac_failed': 0x1,
	}, buf.readUInt8(1), csta.csta_last_power_event);

	/*
	 * XXX more things to decode here.  See:
	 *   28.2 Get Chassis Status Command
	 */

	return (csta);
}
