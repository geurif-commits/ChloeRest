# ChloeRestaurant POS v2.1.0+

Sistema de Punto de Venta (POS) especializado para restaurantes dominicanos con integración DGII, licenciamiento, facturación y gestión de inventario.

**Status**: ✅ Production Ready (Elite Level)  
**Version**: 2.1.0+ (TypeScript/Modern)  
**Last Updated**: 2026-09-02

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 15+
- npm or yarn

### Installation

```bash
# Clone repository
git clone https://github.com/chloerestaurant/pos.git
cd pos

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your configuration

# Run migrations
npm run migrate

# Start development server
npm run dev
```

Server starts at `http://localhost:3000`  
Frontend (if running separately): `http://localhost:5173`

---

## 📚 Documentation

- **[AGENTS.md](./AGENTS.md)** — Developer guide, conventions, how to add features
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — System design, data model, deployment strategy
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** — Code review process, standards

---

## 🛠️ Available Scripts

### Development

```bash
npm run dev              # Start dev server with hot-reload
npm run test:watch      # Run tests in watch mode
npm run lint:fix        # Auto-fix linting issues
npm run format          # Format code with Prettier
```

### Production

```bash
npm run build           # Compile TypeScript to dist/
npm run start           # Run compiled server
npm run test:coverage   # Generate coverage report
```

### Utilities

```bash
npm run typecheck       # Check TypeScript types
npm run lint            # Lint code
npm run migrate         # Run database migrations
```

---

## 🏗️ Project Structure

```
ChloeRestaurant/
├── src/                 # TypeScript source code
│   ├── app.ts          # Express app factory
│   ├── server.ts       # Server entrypoint
│   ├── routers/        # API endpoints by domain
│   ├── services/       # Business logic
│   ├── middleware/     # Express middleware
│   ├── lib/            # Pure utilities
│   ├── db/             # Database layer
│   └── types/          # TypeScript interfaces
├── frontend-restaurante/  # React 19 frontend
├── tests/              # Test suites (unit, integration, E2E)
├── dist/               # Compiled output (git-ignored)
├── AGENTS.md          # Developer guide
├── ARCHITECTURE.md    # System design
└── package.json       # Dependencies and scripts
```

---

## 🔒 Security

- ✅ HTTPS/TLS (production)
- ✅ JWT authentication (24h TTL)
- ✅ Role-based access control (RBAC)
- ✅ Row-level security (PostgreSQL RLS)
- ✅ SQL injection prevention (parameterized queries)
- ✅ Input validation
- ✅ Rate limiting

---

## 📊 Features

### POS Operations

- Create and manage table accounts (cuentas)
- Add items to bills
- Apply discounts
- Accept payments (cash, card, check)
- Generate fiscal receipts (NCF)
- Print receipts

### Inventory

- Real-time stock tracking
- Stock adjustments (entrada, salida, merma)
- Cost-based pricing
- Product catalog management
- Low-stock alerts

### Fiscal Integration (DGII)

- Report 606 (purchases)
- Report 607 (sales)
- ECF (Electronic Control Fiscal)
- NCF validation and generation
- RNC validation

### Multi-Tenant Support

- Multiple restaurants per installation
- Per-restaurant user management
- Isolated data (Row-Level Security)
- Per-restaurant licensing

### Licensing

- License key activation
- Duration-based (7D, 30D, 90D, 6M, 1Y, Lifetime)
- Automatic expiration handling
- License management UI

---

## 🧪 Testing

```bash
npm run test              # Run all tests (unit + integration)
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report (target: 85%+)
npm run test:legacy      # Legacy MJS tests
```

Target coverage:
- **Unit**: 95%+
- **Integration**: 80%+
- **Overall**: 85%+

---

## 🌍 Deployment

### Staging

Push to feature branch → GitHub Actions runs tests → Deploy to staging.chloerestaurant.lat

### Production

Merge to `main` → All tests pass → Code review approved → Manual prod release → Auto-deploy

Health check: `GET /health` and `GET /health/ready`

---

## 📖 API Overview

All endpoints require JWT token in `Authorization: Bearer <token>` header.

### Authentication

```
POST   /api/auth/login        # Login with credentials
POST   /api/auth/refresh      # Refresh access token
POST   /api/auth/logout       # Logout
```

### Accounts (Cuentas)

```
POST   /api/cuentas           # Create new account
GET    /api/cuentas/:id       # Get account details
PUT    /api/cuentas/:id       # Update account
DELETE /api/cuentas/:id       # Close/cancel account
POST   /api/cuentas/:id/items # Add item to account
```

### Products

```
GET    /api/productos         # List all products
POST   /api/productos         # Create product
PUT    /api/productos/:id     # Update product
DELETE /api/productos/:id     # Delete product
```

### Reports

```
GET    /api/reportes/dgii/:periodo  # Get DGII reports
POST   /api/reportes/dgii/generar   # Generate reports
```

Full API documentation: [See ARCHITECTURE.md](./ARCHITECTURE.md)

---

## 🐛 Troubleshooting

### Port Already in Use

```bash
# Change port in .env
PORT=3001 npm run dev
```

### Database Connection Error

Verify PostgreSQL is running and .env contains correct DB credentials:

```bash
psql -U postgres -d chloe_restaurant_db -c "SELECT 1"
```

### TypeScript Errors

```bash
npm run typecheck
```

### ESLint/Format Issues

```bash
npm run lint:fix
npm run format
```

---

## 📞 Support

- **Documentation**: See [AGENTS.md](./AGENTS.md) and [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Issues**: GitHub Issues
- **Security**: Contact security@chloerestaurant.lat

---

## 📝 License

Proprietary. © 2024-2026 ChloeRestaurant.

---

**Happy coding!** 🚀
