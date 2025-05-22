# Snap Kit

Puppeteer-based service designed for seamless web automation. It enables you to effortlessly capture high-fidelity web page screenshots and efficiently scrape web content for precise data extraction.

# How to use Snap Kit?

After installing the Blocklet, Snap Kit provides two APIs:

## POST /crawl

This endpoint allows you to crawl a webpage and capture a screenshot.

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| url | string | Yes | - | The URL to crawl (must be a valid URI) |
| html | boolean | No | true | Whether to crawl HTML content of the page |
| screenshot | boolean | No | false | Whether to capture a screenshot of the page |
| width | number | No | 1440 | Width of the viewport (min: 375px) |
| height | number | No | 900 | Height of the viewport (min: 500px) |
| quality | number | No | 80 | Screenshot quality (1-100) |
| timeout | number | No | 120 | Timeout in seconds (10-120) |
| sync | boolean | No | false | Whether to wait for crawl completion before responding |

#### Response

For asynchronous requests (`sync: false`):
```json
{
  "code": "ok",
  "data": {
    "id": "job_id"
  }
}
```

For synchronous requests (`sync: true`):
```json
{
  "code": "ok",
  "data": {
    "id": "job_id",
    "status": "success or failed", 
    "error": "error message when the status is failed",
    "url": "https://example.com",
    "html": "<!DOCTYPE html>...",
    "screenshot": "image path"
  }
}
```

## GET /snapshot

This endpoint retrieves the result of a previous crawling job.

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| id | string | Yes | - | ID of the crawl job |
| html | boolean | No | true | Whether to include HTML content in the response |
| screenshot | boolean | No | true | Whether to include screenshot in the response |

#### Response

```json
{
  "code": "ok",
  "data": {
    "id": "job_id",
    "status": "success or failed", 
    "error": "error message when the status is failed",
    "url": "https://example.com",
    "html": "<!DOCTYPE html>...",
    "screenshot": "image path"
  }
}
```

If the snapshot is not found, the `data` field will be `null`.

## Authentication

Both APIs require authentication using an access key. Send your access key in the request headers according to the Blocklet SDK authentication method.