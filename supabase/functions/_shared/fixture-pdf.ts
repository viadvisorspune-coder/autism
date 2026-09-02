/**
 * One workflow output, kept as a file so a demonstration does not depend on a
 * deployment being activated.
 *
 * This is a real artefact -- Yoxa produced it from the trigger "i want to get
 * something approved from kavita" -- and it is stored here verbatim, not
 * regenerated or rewritten. It carries its own status text on page one, which
 * is why it is safe to put back on a record: the document says it is an
 * unapproved draft and must not be treated as an approval, and nothing here
 * changes that.
 *
 * BASE64 RATHER THAN A FILE ON DISK. Edge functions cold-start, and a fixture
 * that reads from the filesystem or fetches from storage has two more ways to
 * fail than the answer it is meant to guarantee. Three kilobytes inline has
 * none.
 */

/** The PDF, byte for byte as Yoxa produced it. */
const APPROVAL_DRAFT_B64 =
  'JVBERi0xLjQKJZOMi54gUmVwb3J0TGFiIEdlbmVyYXRlZCBQREYgZG9jdW1lbnQgKG9wZW5zb3VyY2UpCjEgMCBvYmoKPDwK' +
  'L0YxIDIgMCBSIC9GMiAzIDAgUgo+PgplbmRvYmoKMiAwIG9iago8PAovQmFzZUZvbnQgL0hlbHZldGljYSAvRW5jb2Rpbmcg' +
  'L1dpbkFuc2lFbmNvZGluZyAvTmFtZSAvRjEgL1N1YnR5cGUgL1R5cGUxIC9UeXBlIC9Gb250Cj4+CmVuZG9iagozIDAgb2Jq' +
  'Cjw8Ci9CYXNlRm9udCAvSGVsdmV0aWNhLUJvbGQgL0VuY29kaW5nIC9XaW5BbnNpRW5jb2RpbmcgL05hbWUgL0YyIC9TdWJ0' +
  'eXBlIC9UeXBlMSAvVHlwZSAvRm9udAo+PgplbmRvYmoKNCAwIG9iago8PAovQ29udGVudHMgOCAwIFIgL01lZGlhQm94IFsg' +
  'MCAwIDU5NS4yNzU2IDg0MS44ODk4IF0gL1BhcmVudCA3IDAgUiAvUmVzb3VyY2VzIDw8Ci9Gb250IDEgMCBSIC9Qcm9jU2V0' +
  'IFsgL1BERiAvVGV4dCAvSW1hZ2VCIC9JbWFnZUMgL0ltYWdlSSBdCj4+IC9Sb3RhdGUgMCAvVHJhbnMgPDwKCj4+IAogIC9U' +
  'eXBlIC9QYWdlCj4+CmVuZG9iago1IDAgb2JqCjw8Ci9QYWdlTW9kZSAvVXNlTm9uZSAvUGFnZXMgNyAwIFIgL1R5cGUgL0Nh' +
  'dGFsb2cKPj4KZW5kb2JqCjYgMCBvYmoKPDwKL0F1dGhvciAoXChhbm9ueW1vdXNcKSkgL0NyZWF0aW9uRGF0ZSAoRDoyMDI2' +
  'MDgyMzE3MTQzNyswNScwMCcpIC9DcmVhdG9yIChcKHVuc3BlY2lmaWVkXCkpIC9LZXl3b3JkcyAoKSAvTW9kRGF0ZSAoRDoy' +
  'MDI2MDgyMzE3MTQzNyswNScwMCcpIC9Qcm9kdWNlciAoUmVwb3J0TGFiIFBERiBMaWJyYXJ5IC0gXChvcGVuc291cmNlXCkp' +
  'IAogIC9TdWJqZWN0IChcKHVuc3BlY2lmaWVkXCkpIC9UaXRsZSAoRHJhZnQgQXBwcm92YWwgUmVxdWVzdCB0byBLYXZpdGEp' +
  'IC9UcmFwcGVkIC9GYWxzZQo+PgplbmRvYmoKNyAwIG9iago8PAovQ291bnQgMSAvS2lkcyBbIDQgMCBSIF0gL1R5cGUgL1Bh' +
  'Z2VzCj4+CmVuZG9iago4IDAgb2JqCjw8Ci9GaWx0ZXIgWyAvQVNDSUk4NURlY29kZSAvRmxhdGVEZWNvZGUgXSAvTGVuZ3Ro' +
  'IDE0ODQKPj4Kc3RyZWFtCkdhdG06OWxvJlklKSh0LmkyQzZlN2YzZkRcTDJUa1p0Vj1WQ1RIaj1jIWElbWRgMT9HZmQzY3No' +
  'dExQTmRCXU8rZG5bcW5NXkVVdUxCZnEsK1xoSj9xUy0wJW9dKGc4XkM7V05CTjdsciI6OzNlZSFubk9vO0ssTGAzOVp1cl1M' +
  'X284XEMjIVBfKiRQY0krI2xOTFVIKWEwVF5rNl8lJTolM2cldEJSSFg3OV06MyZxRiVBY2lvRSYuKzNyMmI3Ny1WIS82R0Ji' +
  'IllkYi5LVXE5SzlXKXI2S0JRSSIuRiNnJmxhSUhwVztxbEVfKUsqNFdiQ1VEXCRQYkAuZDxCZFwqUCNKQ0FMcmRsVUYlUkR1' +
  'ckhCKy89WD0nXys6W2pycztVay9mMVAma15OJyZLOWFLNm5VVGxiNz8sN0gjajk5OEtRM11ZLSgiZW5gR0gmTVA8Kmc+alkv' +
  'NjBHVXVBYlAuSiI8MUVJOyJjUi42KmIvSUskbl1wcyRFKF5cMGgkM2ZVVldjUFRrIz1jcV04TktUakVfVWhIUT4hTEhQNltV' +
  'UzcrMkUlbFpUMz5Pb0xwbWVCcFFiSmEpMmxsUSNtbCttZGcxai0nU1tCMyVMQEQ4UVs3OXNpRURGJkQvdGRGRkFFbm5LZ01D' +
  'WisqR2UnKEEhOl03XzYnNi0oLF9ANUNIZGg7RENnRmBTPFM2ISVOVShoR1FWdS0yQW9IIjxVYWZHQlpKXVNMOi9kSls9TkRT' +
  'JThKVlckW3Q9IkspJCtuOSZgQWBYVk9VajBWNj0sclIzMGxdaztYYDxRQjtUMnVgTi1iMDw4I0ZIbnByS2wuQiRUZmBZITNB' +
  'X0xDM01SYmc9KE1yZ0wlP11SUCFSKDQ2JFktVWRxaDMwTnIrZiEmIyJCUWwpdHRBJUJlO2BBVG9bX25jKk9uMSdkJ1hgPGwl' +
  'ZFUpSnVmL0dXVkcsNzlcbkRCYWU2WnVbLVNSN09UPCFrV1diWCkwKEUwVSxNMFYsPXJuZ1ppblZOWUBDYmFcZWQuWjNjbCYs' +
  'X1BWR1A4IydicGdpUjpwaC9GL1BEUD5MNXM8NTMmOV8lI2hKLyliQSZuOVZrYjJuXUBvbDhpaGxhKkQhYU9nUTE5OSRubC1Q' +
  'ZSknPjJKcDpiXCUybTFVa2JTOStbLCckZixKIjtuWVptRnRjPWxfW1lrbVg+UzlAZEBbIzgwZWxHKTtZOUBDJmckOGotbVpv' +
  'Z2A5LGlHVkA4YzBDWVgpXk5ZKylmcmhgcGc5SlRYXk5aMylwR0VtQkZFO2hMVig0MSJXWWZxNUFFKVFxaFYuLUhhNisjMlkn' +
  'LlROSU8kdDlRRWckLEM8Ty5taz00XmE0XHRMRyI/Ki0/VjxkQmtlOWZuZikyLV1yXkZnQlhYUEtRcVNtLEtGXTIyLiMlMlE8' +
  'OkQoOlNUUjIjM2FNQlNiWD1pZixvUjYudFhmRTowZzktaj8nVio5ajRzJVZdOU5HO1lbTExSNTUxbygrcTAqJGZvbCRsUC1m' +
  'PS44Zyw3bEI0KWluUGBEXytzXilpI1MkOEciMzlka2xsRUorNGctTkstOXM5O2R0LWIvPCY2bCdnZy1APV9GY2VzXnJvXSRT' +
  'bXA8YzltNGNYXGlQUmVHMWImQVxTTGpRWykzakwnIVs8SkBQKl0oNiJIXmtKUisic1gldHFsdSpZN1ExakwmNmtKYG5OaHBK' +
  'aTdkaU8uJk1KdSdWMFBGI1Q1IWQ+LWpWOmo+UTZrMSlVO1RBO0pxbTFJIXBVKCMhNE4sJl4xVyxrdWw1NStxS1UxO2djTFtF' +
  'SF9IWzIoTCY7TWRGIjBjVzdyVTQhbmU/LlBFOyYwS2hNMXQrblwoVWUvTTo1Ky9TYjskY0ExJihWLm1NWiEpaVVHcTdiTXUv' +
  'UkQwIkxMIilzcDsqcl5laWNgbD4vPGVkVEclZ1ZMRVdcPCknb208RjU+MTtbK0hyblxZKyZiSE1eXX4+ZW5kc3RyZWFtCmVu' +
  'ZG9iagp4cmVmCjAgOQowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwNjEgMDAwMDAgbiAKMDAwMDAwMDEwMiAwMDAwMCBu' +
  'IAowMDAwMDAwMjA5IDAwMDAwIG4gCjAwMDAwMDAzMjEgMDAwMDAgbiAKMDAwMDAwMDUyNCAwMDAwMCBuIAowMDAwMDAwNTky' +
  'IDAwMDAwIG4gCjAwMDAwMDA4OTEgMDAwMDAgbiAKMDAwMDAwMDk1MCAwMDAwMCBuIAp0cmFpbGVyCjw8Ci9JRCAKWzwyYWYz' +
  'ZDk4MzRjZTQ4OWViNmQ5NTUzMzMyZWI1NjRmNT48MmFmM2Q5ODM0Y2U0ODllYjZkOTU1MzMzMmViNTY0ZjU+XQolIFJlcG9y' +
  'dExhYiBnZW5lcmF0ZWQgUERGIGRvY3VtZW50IC0tIGRpZ2VzdCAob3BlbnNvdXJjZSkKCi9JbmZvIDYgMCBSCi9Sb290IDUg' +
  'MCBSCi9TaXplIDkKPj4Kc3RhcnR4cmVmCjI1MjUKJSVFT0YK'

/** Decoded once per cold start, not once per request. */
export const approvalDraftPdf = (): Uint8Array => {
  const raw = atob(APPROVAL_DRAFT_B64)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}
