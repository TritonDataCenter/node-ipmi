/* vim: set ts=8 sts=8 sw=8 noet: */

var mod_assert = require('assert-plus');

var lib_common = require('./common');

var ASF_IANA = 4542;

var ASF_MESSAGE_TYPES = [
	{ v: 0x40, n: 'pong' },
	{ v: 0x80, n: 'ping' },
];

function
decode_msgtype(byt)
{
	return (lib_common.lookup_vton(ASF_MESSAGE_TYPES, byt));
}

function
decode_pong(buf)
{
	if (buf.length < 16) {
		throw (new Error('ASF pong too short'));
	}

	var ents = buf.readUInt8(8);

	var pong = {
		pong_iana: buf.readUInt32BE(0),
		pong_oem: buf.readUInt32BE(4),
		pong_ipmi_supported: !!(ents & 0x80),
		pong_asf_version: (ents & 0xf),
		pong_entities: ents,
		pong_interactions: buf.readUInt8(9)
	};

	return (pong);
}

function
decode_packet(buf)
{
	if (buf.length < 8) {
		throw (new Error('ASF packet too short'));
	}

	var len = buf.readUInt8(7);

	var asf = {
		asf_iana: buf.readUInt32BE(0),
		asf_msgtype: decode_msgtype(buf.readUInt8(4)),
		asf_msgtag: buf.readUInt8(5),
		asf_data: buf.slice(8)
	};

	if (asf.asf_data.length !== len) {
		throw (new Error('ASF data length did not match header'));
	}

	switch (asf.asf_msgtype) {
	case 'pong':
		asf.asf_pong = decode_pong(asf.asf_data);
		break;
	}

	return (asf);
}

function
encode_packet(asf)
{
	var pos = 0;
	var buf = new Buffer(8);

	buf.writeUInt32BE(ASF_IANA, pos);
	pos += 4;

	mod_assert.string(asf.asf_msgtype, 'asf_msgtype');
	buf.writeUInt8(lib_common.lookup_ntov(ASF_MESSAGE_TYPES,
	    asf.asf_msgtype), pos);
	pos += 1;

	mod_assert.number(asf.asf_msgtag, 'asf_msgtag');
	buf.writeUInt8(asf.asf_msgtag, pos);
	pos += 1;

	buf.writeUInt8(0, pos);
	pos += 1;

	buf.writeUInt8(0, pos);
	pos += 1;

	return (buf);
}

module.exports = {
	decode_packet: decode_packet,
	encode_packet: encode_packet,
};
