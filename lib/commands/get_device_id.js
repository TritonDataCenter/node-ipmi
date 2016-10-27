/* vim: set ts=8 sts=8 sw=8 noet: */

var mod_assert = require('assert-plus');

var lib_common = require('../common');

module.exports = function () {
	return ({
		cmd_name: 'get_device_id',
		cmd_code: 0x01,
		cmd_netfn: 'app',
		cmd_encoder: encode_get_device_id,
		cmd_decoder: decode_get_device_id,
		cmd_desc: 'Get Device ID',
		cmd_cc_extra: null,
	});
};

function
encode_get_device_id(type, extra, buf)
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
decode_get_device_id(buf)
{
	var dvid = {
		dvid_device_support: []
	};
	var pos = 0;

	dvid.dvid_device_id = buf.readUInt8(pos);
	pos += 1;

	var t = buf.readUInt8(pos);
	pos += 1;

	lib_common.bits_decode_object({
		dvid_has_dev_sdrs: 0x80,
	}, t, dvid);
	dvid.dvid_revision = t & 0x0f;

	t = buf.readUInt8(pos);
	pos += 1;
	dvid.dvid_fw_rev0 = t & 0x7f;

	dvid.dvid_fw_rev1 = buf.readUInt8(pos);
	pos += 1;

	t = buf.readUInt8(pos);
	pos += 1;
	dvid.dvid_ipmi_version = (t & 0xf) + '.' + ((t & 0xf0) >> 4);

	lib_common.bits_decode_array({
		'chassis': 0x80,
		'bridge': 0x40,
		'event_send': 0x20,
		'event_recv': 0x10,
		'fru': 0x08,
		'sel': 0x04,
		'sdr': 0x02,
		'sensor': 0x01,
	}, buf.readUInt8(pos), dvid.dvid_device_support);

	/*
	 * XXX more things to decode here.  See:
	 *   20.1 Get Device ID Command
	 */

	return (dvid);
}
