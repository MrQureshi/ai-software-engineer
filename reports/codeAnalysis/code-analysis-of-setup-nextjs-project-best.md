# CODE ANALYSIS

## Setting up a Next.js project with the best UI

### 1. Install Next.js and a UI library

```bash
npx create-next-app@latest
# UI library – choose one
# Tailwind CSS (built into create-next-app prompts)
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
# Chakra UI
npm install @chakra-ui/react @emotion/react @emotion/styled framer-motion
# MUI
npm install @mui/material @emotion/react @emotion/styled
```

### 2. Recommended scripts (`package.json`)

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "test": "jest"
}
```

### 3. Folder layout

```
app/            # App Router (or pages/ for Pages Router)
  layout.tsx
  page.tsx
components/
  Layout.tsx
  Header.tsx
  Footer.tsx
styles/
  globals.css   # Tailwind directives or CSS reset
public/
```

### 4. TypeScript configuration (`tsconfig.json`)

```json
{
  "compilerOptions": {
    "target": "es2022",
    "module": "esnext",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "esModuleInterop": true,
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "baseUrl": ".",
    "paths": {
      "@/*": ["*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

### 5. UI library setup

**Tailwind** (`styles/globals.css`)
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

**Chakra UI** (`app/layout.tsx`)
```tsx
import { ChakraProvider } from "@chakra-ui/react";
import Layout from "@/components/Layout";
import "../styles/globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ChakraProvider>
          <Layout>{children}</Layout>
        </ChakraProvider>
      </body>
    </html>
  );
}
```

### 6. Global layout & base styles

Create a reusable `components/Layout.tsx` with header, navigation, and footer, and wrap it around the root layout. Include the UI library's reset/baseline (Tailwind's `@tailwind base`, Chakra's `<CSSReset />`, or MUI's `<CssBaseline />`).

### 7. Environment variables

Use `.env.local`. Prefix any variable that must be readable in the browser with `NEXT_PUBLIC_`.

### 8. Linting & formatting

```bash
npm install -D eslint prettier eslint-config-prettier eslint-plugin-react eslint-plugin-react-hooks eslint-plugin-jsx-a11y
npx eslint --init   # choose "Next.js" preset
```

### 9. Testing

```bash
npm install -D jest @types/jest ts-jest @testing-library/react @testing-library/jest-dom
npx ts-jest config:init
```
Add `jest.config.js` and a sample test, e.g. `components/__tests__/Header.test.tsx`.

### 10. CI pipeline

Add `.github/workflows/ci.yml` running `npm ci`, `npm run lint`, `npm run type-check`, and `npm test`.

### 11. Performance

Use `next/image` for images, enable compression in `next.config.js`, and use `next/script` for third-party scripts/analytics.

### 12. Documentation

Add a `README.md` covering: Prerequisites, Installation, Development, Testing, Linting, Build & Deploy, Environment Variables.

### 13. Deployment

Push to GitHub and connect to Vercel (or run `vercel` CLI) — Vercel auto-detects Next.js and builds it. Netlify is a viable alternative.
