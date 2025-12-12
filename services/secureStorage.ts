const SECRET_SALT = "TiNO-SECURE-SALT-v36";

const encrypt = (text: string): string => {
  try {
    const textToChars = (text: string) => text.split("").map((c) => c.charCodeAt(0));
    const byteHex = (n: number) => ("0" + Number(n).toString(16)).substr(-2);
    // Simple XOR-like transformation with salt
    const applySaltToChar = (code: number) => textToChars(SECRET_SALT).reduce((a, b) => a ^ b, code);

    return text
      .split("")
      .map(textToChars)
      .map(a => applySaltToChar(a[0]))
      .map(byteHex)
      .join("");
  } catch (e) {
    console.error("Encrypt failed", e);
    return text;
  }
};

const decrypt = (encoded: string): string => {
  try {
    const textToChars = (text: string) => text.split("").map((c) => c.charCodeAt(0));
    const applySaltToChar = (code: number) => textToChars(SECRET_SALT).reduce((a, b) => a ^ b, code);
    
    return (encoded.match(/.{1,2}/g) || [])
      .map((hex) => parseInt(hex, 16))
      .map(applySaltToChar)
      .map((charCode) => String.fromCharCode(charCode))
      .join("");
  } catch (e) {
    // console.error("Decrypt failed", e); // Silent fail for migration
    return encoded;
  }
};

export const secureStorage = {
  setItem: (key: string, value: any) => {
    try {
        const stringValue = JSON.stringify(value);
        const encrypted = encrypt(stringValue);
        localStorage.setItem(key, encrypted);
    } catch (e) {
        console.error("Secure Set Error", e);
    }
  },
  getItem: <T>(key: string): T | null => {
    const encrypted = localStorage.getItem(key);
    if (!encrypted) return null;
    try {
      // Try decrypting
      const decrypted = decrypt(encrypted);
      return JSON.parse(decrypted) as T;
    } catch (e) {
      // Fallback: Data might be plain text from previous version
      try {
          const plain = JSON.parse(encrypted);
          // Auto-migrate to secure
          secureStorage.setItem(key, plain);
          return plain as T;
      } catch (e2) {
          return null;
      }
    }
  },
  removeItem: (key: string) => {
    localStorage.removeItem(key);
  }
};