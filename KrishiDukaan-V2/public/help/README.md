# Help page screenshots

Drop real portal screenshots here to power the visual previews on the Help /
Documentation page (`/?view=help`). Until a file exists, the Help page shows a
styled placeholder (section icon + "Preview coming soon") — nothing breaks.

## Convention

Each documentation section loads `/help/<id>.webp`. The mapping lives in
`app/views/helpMedia.ts` (`HELP_ENRICHMENTS`). Expected file names:

| File                          | Section / screen                         |
| ----------------------------- | ---------------------------------------- |
| `home.webp`                    | Home / landing                           |
| `market.webp`                  | Market discovery                         |
| `hub.webp`                     | Hub (crop guidance)                      |
| `stores.webp`                  | Stores locator (map)                     |
| `login.webp`                   | Sign up / login                          |
| `subscription.webp`            | Subscription activation                  |
| `account.webp`                 | Account menu                             |
| `dashboard.webp`               | Dashboard home                           |
| `dashboard-overview.webp`      | Dashboard → Overview                     |
| `analytics.webp`               | Dashboard → Analytics                    |
| `inventory.webp`               | Dashboard → Inventory                    |
| `product-creation.webp`        | Product creation flow                    |
| `retailer-network.webp`        | Retailer network                         |
| `add-retailer.webp`            | Add retailer form                        |
| `invite.webp`                  | Invite & sharing                         |
| `assign-product.webp`          | Assign product                           |
| `retailer-details.webp`        | Retailer details panel                   |
| `subscription-mgmt.webp`       | Subscription management                  |
| `listing.webp`                 | Listing management                       |
| `orders.webp`                  | Orders management                        |
| `reviews.webp`                 | Reviews                                  |
| `profile.webp`                 | Profile & settings                       |
| `settings.webp`                | Settings                                 |

## Recommended specs

- Aspect ratio **16:10** (e.g. 1280×800), cropped to the relevant UI.
- **WebP**, ideally < 150 KB each (images are lazy-loaded). Convert a PNG
  capture with e.g. `cwebp -q 85 home.png -o home.webp` or squoosh.app. The
  older `.png` files here are kept only so existing links keep working.
- Use the file name from the table above; to use a different path or add extra
  previews per section, edit `HELP_ENRICHMENTS` in `app/views/helpMedia.ts`.
