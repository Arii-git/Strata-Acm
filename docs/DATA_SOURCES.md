# Data sources to assess later

Do not import any data before a human reviews its license, permitted use, privacy status and mapping to STRATA's frozen schema. This prototype currently uses synthetic data by design.

## Suitable categories

| Need | Candidate source | What to look for before use |
| --- | --- | --- |
| Orders, customers and product demand | Public retail/e-commerce transactional datasets, such as UCI Online Retail or Kaggle Olist datasets | Order ID, customer key, date, product/SKU, quantity, revenue; remove direct identifiers and map to synthetic account IDs first. |
| Inventory and supplier operations | Public supply-chain/logistics datasets on data portals or Kaggle | Stock level, delivery promise and actual dates, supplier and warehouse events; check that redistribution is allowed. |
| Customer service | Public help-desk/ticket datasets or a company-owned, redacted export | Ticket time, category, severity, first-response time and resolution; never import message bodies containing personal or medical data. |
| Macroeconomic disruption context | Government open-data portals, weather/disaster data and World Bank indicators | Event date, geography and source license; use only as context, not as a substitute for operating records. |
| Internal pilot data | A company-owned CSV export approved by its data owner | A written data-processing agreement, field-level minimisation, redaction and an explicit schema mapping. |

## Practical sequence

1. Start with one non-sensitive CSV that contains orders or inventory, rather than combining multiple unknown datasets.
2. Create a mapping document from the source fields to STRATA's contracts; preserve the source's definition and time window for every metric.
3. Redact direct identifiers before import and keep the raw file outside this repository.
4. Mark all imported views with their actual provenance and source date; never retain the synthetic label for real data.
5. Run the data-health checks and a small hold-out evaluation before presenting any performance claim.

## Sources to inspect online

- [UCI Machine Learning Repository — Online Retail](https://archive.ics.uci.edu/dataset/352/online+retail)
- [Kaggle — Olist Brazilian E-Commerce Public Dataset](https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce)
- [data.gov](https://data.gov/)
- [World Bank Open Data](https://data.worldbank.org/)

These are discovery starting points, not endorsements or imported sources. Confirm each dataset's current license and allowed use before downloading it.
