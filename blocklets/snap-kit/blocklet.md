# Snap Kit

Puppeteer-based service designed for seamless web automation. It enables you to effortlessly capture high-fidelity web page screenshots and efficiently scrape web content for precise data extraction.

## How to use Snap Kit?

After installing the Blocklet, Snap Kit provides four APIs:

### POST /api/crawl

Crawl a webpage and extract its HTML content.

##### Parameters

| Parameter    | Type    | Required | Default | Description                                            |
| ------------ | ------- | -------- | ------- | ------------------------------------------------------ |
| url          | string  | Yes      | -       | The URL to crawl (must be a valid URI)                 |
| timeout      | number  | No       | 120     | Timeout in seconds (10-120)                            |
| waitTime     | number  | No       | 0       | At least the time to wait for the page (0-120)         |
| sync         | boolean | No       | false   | Whether to wait for crawl completion before responding |
| header       | json    | No       | -       | Request headers when accessing the page                |
| cookies      | array   | No       | -       | Request cookies when accessing the page                |
| localStorage | array   | No       | -       | set localStorage when accessing the page               |

cookies:

`Array<{ name: string, value: string, domain?: string, expires?: string, path?: string }>`

localStorage:

`Array<{ key: string, value: string }>`

##### Response

For asynchronous requests (`sync: false`):

```json
{
  "code": "ok",
  "data": {
    "jobId": "job_id"
  }
}
```

For synchronous requests (`sync: true`):

```json
{
  "code": "ok",
  "data": {
    "jobId": "job_id",
    "url": "https://example.com",
    "html": "<!DOCTYPE html>...",
    "status": "success | failed | pending",
    "error": "error message when the status is failed",
    "meta": {
      "title": "document title",
      "description": "document description"
    }
  }
}
```

### GET /api/crawl

Retrieves the HTML content of a previous crawling job.

##### Parameters

| Parameter | Type   | Required | Default | Description         |
| --------- | ------ | -------- | ------- | ------------------- |
| jobId     | string | Yes      | -       | ID of the crawl job |

##### Response

```json
{
  "code": "ok",
  "data": {
    "jobId": "job_id",
    "url": "https://example.com",
    "html": "<!DOCTYPE html>...",
    "status": "success | failed | pending",
    "error": "error message when the status is failed",
    "meta": {
      "title": "document title",
      "description": "document description"
    }
  }
}
```

### POST /api/snap

Capture a screenshot of a webpage.

##### Parameters

| Parameter    | Type    | Required | Default | Description                                              |
| ------------ | ------- | -------- | ------- | -------------------------------------------------------- |
| url          | string  | Yes      | -       | The URL to capture (must be a valid URI)                 |
| width        | number  | No       | 1440    | Width of the viewport (min: 375px)                       |
| height       | number  | No       | 900     | Height of the viewport (min: 500px)                      |
| quality      | number  | No       | 80      | Screenshot quality (1-100)                               |
| timeout      | number  | No       | 120     | Timeout in seconds (10-120)                              |
| waitTime     | number  | No       | 0       | At least the time to wait for the page (0-120)           |
| fullPage     | boolean | No       | false   | Whether to capture the full page or just the viewport    |
| sync         | boolean | No       | false   | Whether to wait for capture completion before responding |
| header       | json    | No       | -       | Request headers when accessing the page                  |
| cookies      | array   | No       | -       | Request cookies when accessing the page                  |
| localStorage | array   | No       | -       | set localStorage when accessing the page                 |

##### Response

For asynchronous requests (`sync: false`):

```json
{
  "code": "ok",
  "data": {
    "jobId": "job_id"
  }
}
```

For synchronous requests (`sync: true`):

```json
{
  "code": "ok",
  "data": {
    "jobId": "job_id",
    "url": "https://example.com",
    "screenshot": "image path",
    "status": "success | failed | pending",
    "error": "error message when the status is failed",
    "options": {}, // similar to request parameters
    "meta": {
      "title": "document title",
      "description": "document description"
    }
  }
}
```

#### GET /api/snap

Retrieves the screenshot of a previous capture job.

##### Parameters

| Parameter | Type   | Required | Default | Description        |
| --------- | ------ | -------- | ------- | ------------------ |
| jobId     | string | Yes      | -       | ID of the snap job |

##### Response

```json
{
  "code": "ok",
  "data": {
    "jobId": "job_id",
    "url": "https://example.com",
    "screenshot": "image path",
    "status": "success | failed | pending",
    "error": "error message when the status is failed",
    "options": {}, // similar to request parameters
    "meta": {
      "title": "document title",
      "description": "document description"
    }
  }
}
```

### POST /api/carbon

Capture a screenshot of code by carbon.

##### Parameters

| Parameter | Type    | Required | Default | Description                                              |
| --------- | ------- | -------- | ------- | -------------------------------------------------------- |
| timeout   | number  | No       | 120     | Timeout in seconds (10-120)                              |
| sync      | boolean | No       | false   | Whether to wait for capture completion before responding |
| code      | string  | Yes      | ''      | The code you need to take a screenshot                   |

Carbon params:

Edit and copy the screenshot parameters you need here (https://carbon.now.sh/)

```javascript
{
  bg: Joi.string().default('rgba(171, 184, 195, 1)'),
  t: Joi.string().default('one-dark'),
  wt: Joi.string().default('none'),
  l: Joi.string().default('auto'),
  width: Joi.number().default(680),
  ds: Joi.string().default('true'),
  dsyoff: Joi.string().default('20px'),
  dsblur: Joi.string().default('68px'),
  wc: Joi.string().default('true'),
  wa: Joi.string().default('true'),
  pv: Joi.string().default('21px'),
  ph: Joi.string().default('19px'),
  ln: Joi.string().default('false'),
  fl: Joi.string().default('1'),
  fm: Joi.string().default('Hack'),
  fs: Joi.string().default('14px'),
  lh: Joi.string().default('133%'),
  si: Joi.string().default('false'),
  es: Joi.string().default('2x'),
  wm: Joi.string().default('false'),
}
```

##### Response

For asynchronous requests (`sync: false`):

```json
{
  "code": "ok",
  "data": {
    "jobId": "job_id"
  }
}
```

For synchronous requests (`sync: true`):

```json
{
  "code": "ok",
  "data": {
    "jobId": "job_id",
    "url": "https://example.com",
    "screenshot": "image path",
    "status": "success | failed | pending",
    "error": "error message when the status is failed",
    "options": {}, // similar to request parameters
    "meta": {
      "title": "document title",
      "description": "document description"
    }
  }
}
```

#### GET /api/carbon

Retrieves the screenshot of a previous carbon job.

##### Parameters

| Parameter | Type   | Required | Default | Description        |
| --------- | ------ | -------- | ------- | ------------------ |
| jobId     | string | Yes      | -       | ID of the snap job |

##### Response

```json
{
  "code": "ok",
  "data": {
    "jobId": "job_id",
    "url": "https://example.com",
    "screenshot": "image path",
    "status": "success | failed | pending",
    "error": "error message when the status is failed",
    "options": {}, // similar to request parameters
    "meta": {
      "title": "document title",
      "description": "document description"
    }
  }
}
```

If the job result is not found, the `data` field will be `null`.

## Authentication

All APIs require authentication using an access key. Send your access key in the request headers according to the Blocklet SDK authentication method.

https://www.arcblock.io/docs/blocklet-developer/en/access-key

### Example

```bash
curl --request GET \
  --url 'https://snap.createblocklet.dev/api/crawl?jobId=fecdff7e-a633-4bbb-8c2a-8e635802522e' \
  --header 'Authorization: Bearer ACCESS-KEY'
```
