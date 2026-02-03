import base64
import json
from Crypto.Cipher import AES

class wxdatacrypt:
    def __init__(self, appId, sessionKey):
        self.appId = appId
        self.sessionKey = sessionKey

    def decrypt(self, encryptedData, iv):
        # base64 decode
        sessionKey = base64.b64decode(self.sessionKey)
        encryptedData = base64.b64decode(encryptedData)
        iv = base64.b64decode(iv)
        
        cipher = AES.new(sessionKey, AES.MODE_CBC, iv)
        
        decrypted = cipher.decrypt(encryptedData)
        decrypted = self._unpad(decrypted)
        
        decrypted = decrypted.decode('utf-8')
        decrypted = json.loads(decrypted)
        return decrypted

    def _unpad(self, s):
        # PKCS#7 去填充，兼容 Python3 bytes
        if not s:
            return s
        # s[-1] 在 Python3 下为 int；在切片时为 bytes
        if isinstance(s[-1], int):
            pad_len = s[-1]
        else:
            pad_len = ord(s[-1:])
        if pad_len <= 0 or pad_len > len(s):
            # 非法填充长度，直接返回原始数据避免崩溃，由上层报错
            return s
        return s[:-pad_len]