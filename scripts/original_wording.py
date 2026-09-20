"""Decode the existing source-bound map entry, not its enclosing protobuf bytes as text."""

def value_of(row):
    if 'hex' not in row:
        return row['text']
    data = bytes.fromhex(row['hex'])
    def varint(data, offset):
        value = shift = 0
        while offset < len(data) and shift < 64:
            byte = data[offset]; offset += 1
            value |= (byte & 127) << shift
            if byte < 128: return value, offset
            shift += 7
        raise ValueError('Invalid wording length')
    for _ in range(4):
        offset = 0; fields = {}
        while offset < len(data):
            tag, offset = varint(data, offset)
            if tag & 7 != 2: raise ValueError('Expected wording string fields')
            size, offset = varint(data, offset)
            if offset + size > len(data): raise ValueError('Truncated wording field')
            fields[tag >> 3] = data[offset:offset + size]; offset += size
        if fields.get(1, b'').decode('utf-8') != row['key']:
            raise ValueError('Wording key mismatch')
        data = fields[2]
        if not data.startswith(b'\x0a' + bytes([len(row['key'].encode())]) + row['key'].encode()):
            return data.decode('utf-8')
    raise ValueError('Unexpected recursive wording entry')
