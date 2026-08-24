This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Seeded catalog images for 2D virtual try-on

The 2D VTON provider fetches garment images from the public internet, so seed
products must use public HTTPS image URLs rather than local `/products/...`
paths. The shared Supabase project stores these assets in its public `catalog`
bucket.

For a new Supabase environment, configure `SUPABASE_SERVICE_KEY` and run this
from the repository root before seeding or testing 2D VTON:

```bash
npm run upload:seed-images
```

The command is idempotent: it uploads `public/products/*` to
`catalog/seeded-products/` and repairs existing product records that still use
local paths. Keep the project hostname in `VTON_ALLOWED_IMAGE_HOSTS`.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load Inter, a custom Google Font.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
