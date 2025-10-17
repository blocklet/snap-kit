# 📸 Snap Kit

<div align="center">
  <img src="blocklets/snap-kit/logo.png" alt="Snap Kit Logo" width="128" height="128">

  **Enterprise-grade web automation platform powered by Puppeteer**

  ![License](https://img.shields.io/badge/license-MIT-blue.svg)
  ![Version](https://img.shields.io/badge/version-1.3.0-green.svg)
  ![Node.js](https://img.shields.io/badge/Node.js-18%2B-brightgreen.svg)
  ![TypeScript](https://img.shields.io/badge/TypeScript-5.7%2B-blue.svg)

  [Features](#features) • [Quick Start](#quick-start) • [Architecture](#architecture) • [API Reference](#api-reference) • [Examples](#examples)
</div>

---

## 🚀 Why Snap Kit?

**Snap Kit** is a production-ready web automation platform that transforms how you handle web scraping, screenshot generation, and SEO optimization. Built on the powerful Blocklet ecosystem, it delivers enterprise-grade reliability with developer-friendly APIs.

### 💡 Key Benefits

- **Zero Configuration**: Deploy instantly with Docker or Blocklet Server
- **Production Scale**: Handle thousands of concurrent requests with built-in queuing
- **SEO Powerhouse**: Pre-render SPAs for perfect search engine indexing
- **Developer Experience**: Modern TypeScript APIs with comprehensive documentation
- **Cost Effective**: Self-hosted solution with no per-request fees

## ✨ Features

### 🎯 Core Capabilities

- **High-Fidelity Screenshots**: Capture pixel-perfect web page snapshots
- **Smart Content Extraction**: Extract structured data with advanced parsing
- **Batch Processing**: Process multiple URLs efficiently with queue management
- **Sitemap Crawling**: Automatically discover and crawl entire websites
- **SEO Pre-rendering**: Generate search-engine-friendly HTML for SPAs
- **Custom Headers & Cookies**: Full control over request customization

### 🔧 Technical Highlights

- **Puppeteer Integration**: Latest Chrome automation capabilities
- **SQLite Database**: Efficient data storage with Sequelize ORM
- **React 19.1 UI**: Modern, responsive web interface
- **Express 4.21 API**: RESTful endpoints with TypeScript
- **Blocklet Platform**: One-click deployment and scaling

## 📦 What's Included

This monorepo contains three production-ready modules:

### 🏗️ Snap Kit Blocklet

**Location**: `blocklets/snap-kit`

The main application featuring:

- **React Frontend**: Modern UI for managing crawling tasks
- **Express API**: RESTful endpoints for automation
- **DID Authentication**: Secure access control
- **Real-time Dashboard**: Monitor crawling progress

### 🕷️ Crawler Engine

**Location**: `packages/crawler`

Core automation engine with:

- **Puppeteer Integration**: Latest Chrome automation
- **Database Management**: SQLite with migrations
- **Queue System**: Efficient batch processing
- **Scheduled Tasks**: Automated crawling workflows

### 🌐 SEO Middleware

**Location**: `packages/middleware`

Express middleware for:

- **Pre-rendering**: Generate static HTML for SPAs
- **Cache Management**: Intelligent caching strategies
- **Search Engine Optimization**: Perfect SEO for dynamic content

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm
- Docker (optional)

### Installation

```bash
# Clone the repository
git clone https://github.com/blocklet/snap-kit.git
cd snap-kit

# Install dependencies
pnpm install

# Start development environment
pnpm dev
```

### Docker Deployment

```bash
# Build and run with Docker
docker run -p 3000:3000 arcblock/snap-kit
```

### Blocklet Server

```bash
# Deploy to Blocklet Server
npm run deploy
```

## 🏗️ Architecture

```
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│                     │    │                     │    │                     │
│   React Frontend    │───▶│   Express API       │───▶│   Crawler Engine    │
│                     │    │                     │    │                     │
│  • Modern UI        │    │  • RESTful API      │    │  • Puppeteer        │
│  • Real-time        │    │  • Authentication   │    │  • Queue System     │
│  • Dashboard        │    │  • Rate Limiting    │    │  • SQLite Storage   │
│                     │    │                     │    │                     │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
```

### Technology Stack

- **Frontend**: React 19.1, TypeScript, Vite 7.0
- **Backend**: Express 4.21, TypeScript, DID Auth
- **Database**: SQLite with Sequelize ORM
- **Automation**: Puppeteer, @blocklet/puppeteer
- **Deployment**: Blocklet Platform, Docker

## 📚 API Reference

### Screenshot Generation

```typescript
POST /api/screenshot
{
  "url": "https://example.com",
  "options": {
    "width": 1920,
    "height": 1080,
    "fullPage": true
  }
}
```

### Content Extraction

```typescript
POST /api/extract
{
  "url": "https://example.com",
  "selectors": {
    "title": "h1",
    "description": "meta[name='description']"
  }
}
```

### Batch Processing

```typescript
POST /api/crawl/batch
{
  "urls": ["https://site1.com", "https://site2.com"],
  "options": {
    "priority": "high",
    "schedule": "immediate"
  }
}
```

## 🎯 Use Cases

### 📊 Website Monitoring

Monitor competitor websites and track changes automatically.

### 🔍 SEO Optimization

Pre-render SPAs for perfect search engine indexing.

### 📈 Data Analytics

Extract structured data from websites for business intelligence.

### 🖼️ Visual Testing

Generate screenshots for visual regression testing.

### 📱 Social Media

Create automated social media preview generation.

## 🛠️ Development

### Commands

```bash
# Development
pnpm dev                    # Start all services
pnpm build:packages        # Build all packages
pnpm lint                  # Lint all packages
pnpm lint:fix              # Fix lint issues

# Snap Kit Blocklet
cd blocklets/snap-kit
npm run dev                # Development server
npm run bundle             # Production build
npm run deploy             # Deploy to Blocklet Server
```

### Project Structure

```
snap-kit/
├── blocklets/snap-kit/     # Main Blocklet application
│   ├── src/               # React frontend
│   ├── api/               # Express API
│   └── public/            # Static assets
├── packages/
│   ├── crawler/           # Core crawler engine
│   └── middleware/        # SEO middleware
└── scripts/               # Build and utility scripts
```

## 🔒 Security

- **DID Authentication**: Secure decentralized identity
- **Rate Limiting**: Prevent abuse and ensure fair usage
- **Input Validation**: Comprehensive request sanitization
- **CORS Configuration**: Secure cross-origin requests

## 📖 Documentation

- [Snap Kit Blocklet](https://github.com/blocklet/snap-kit/blob/master/blocklets/snap-kit/blocklet.md)
- [Crawler Engine](https://github.com/blocklet/snap-kit/blob/master/packages/crawler/README.md)
- [SEO Middleware](https://github.com/blocklet/snap-kit/blob/master/packages/middleware/README.md)

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🌟 Support

- 📧 Email: blocklet@arcblock.io
- 🐛 Issues: [GitHub Issues](https://github.com/blocklet/snap-kit/issues)

---

<div align="center">
  <strong>Built with ❤️ by the ArcBlock team</strong>
  <br>
  <a href="https://www.arcblock.io">ArcBlock</a> •
  <a href="https://www.blocklet.io">Blocklet</a> •
  <a href="https://github.com/blocklet">GitHub</a>
</div>
