# Move to the Free plan (optional)

Removing the add-on already saves money. Downgrading is a separate choice. Limits checked November 25, 2026: see [current pricing](https://supabase.com/pricing).

## Check that you fit

| Free limit | Amount |
|---|---|
| Active projects | 2 |
| Database | 500 MB per project |
| File storage | 1 GB |
| Egress | 5 GB per month |
| Monthly active users | 50,000 |
| Automatic backups | None |
| Inactivity | Paused after 1 week |

Check database size in the SQL Editor:

```sql
select pg_size_pretty(pg_database_size(current_database()));
```

Check the organization's **Usage** page for the rest.

Before you downgrade:

- [ ] The change applies to **every project in the organization**.
- [ ] Turn off paid add-ons and paid features you use (for example larger compute, point-in-time recovery, IPv4, image transformations, leaked password protection).
- [ ] Plan your own backups. Repeat the [backup steps](remove-custom-domain.md) on a schedule.
- [ ] Expect a short restart. Pick a quiet time.

Then open the organization's **Billing** page, change the plan to **Free**, and rerun the [test list](setup.md#test-it).

## "You have reached the free project limit"

You get two active Free projects. Supabase counts the quota of every **Owner and Admin** in the organization, so another member can be the one who is full. Paused projects do not count.

Your options:

1. Pause or delete a project you truly do not need. Pausing takes that project offline. Back it up first.
2. If a project really belongs to another person or team, they can own it in their own organization. Agree on this with them, understand that Owners control billing and deletion, and confirm the new Owner can sign in before changing any roles. Do not remove your last working Owner.
3. Stay on the paid plan.

Do not create extra accounts to get around the limit.

## Undo

Upgrade again from **Billing**. Your project ref stays the same.

[Supabase billing questions](https://supabase.com/docs/guides/platform/billing-faq)
