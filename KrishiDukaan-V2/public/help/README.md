# Help page screenshots

Drop real portal screenshots here to power the visual previews on the Help /
Documentation page (`/?view=help`). Until a file exists, the Help page shows a
styled placeholder (section icon + "Preview coming soon") — nothing breaks.

## Convention

Each documentation section loads `/help/<id>.png`. The mapping lives in
`app/views/helpMedia.ts` (`HELP_ENRICHMENTS`). Expected file names:

| File                          | Section / screen                         |
| ----------------------------- | ---------------------------------------- |
| `home.png`                    | Home / landing                           |
| `market.png`                  | Market discovery                         |
| `hub.png`                     | Hub (crop guidance)                      |
| `stores.png`                  | Stores locator (map)                     |
| `login.png`                   | Sign up / login                          |
| `subscription.png`            | Subscription activation                  |
| `account.png`                 | Account menu                             |
| `dashboard.png`               | Dashboard home                           |
| `dashboard-overview.png`      | Dashboard → Overview                     |
| `analytics.png`               | Dashboard → Analytics                    |
| `inventory.png`               | Dashboard → Inventory                    |
| `product-creation.png`        | Product creation flow                    |
| `retailer-network.png`        | Retailer network                         |
| `add-retailer.png`            | Add retailer form                        |
| `invite.png`                  | Invite & sharing                         |
| `assign-product.png`          | Assign product                           |
| `retailer-details.png`        | Retailer details panel                   |
| `subscription-mgmt.png`       | Subscription management                  |
| `listing.png`                 | Listing management                       |
| `orders.png`                  | Orders management                        |
| `reviews.png`                 | Reviews                                  |
| `profile.png`                 | Profile & settings                       |
| `settings.png`                | Settings                                 |

## Recommended specs

- Aspect ratio **16:10** (e.g. 1280×800), cropped to the relevant UI.
- **PNG or WebP**, ideally < 300 KB each (images are lazy-loaded).
- Use the file name from the table above; to use a different path or add extra
  previews per section, edit `HELP_ENRICHMENTS` in `app/views/helpMedia.ts`.
