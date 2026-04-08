package handler

import (
	"bytes"
	"io"
	"strings"
	"unicode/utf8"

	"golang.org/x/text/encoding/simplifiedchinese"
	"golang.org/x/text/transform"
)

func decodeCSVContent(buf []byte) string {
	if len(buf) == 0 {
		return ""
	}
	if strings.HasPrefix(string(buf), "\xEF\xBB\xBF") {
		return strings.TrimPrefix(string(buf), "\xEF\xBB\xBF")
	}
	if utf8Like(buf) {
		return string(buf)
	}
	reader := transform.NewReader(bytes.NewReader(buf), simplifiedchinese.GBK.NewDecoder())
	decoded, err := ioReadAll(reader)
	if err == nil && utf8Like(decoded) {
		return strings.TrimPrefix(string(decoded), "\xEF\xBB\xBF")
	}
	return string(buf)
}

func utf8Like(b []byte) bool {
	for len(b) > 0 {
		r, size := utf8.DecodeRune(b)
		if r == utf8.RuneError && size == 1 {
			return false
		}
		b = b[size:]
	}
	return true
}

func ioReadAll(r io.Reader) ([]byte, error) {
	return io.ReadAll(r)
}
