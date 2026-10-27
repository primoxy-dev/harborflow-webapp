# Quotation and cost rates

Quotation uses the existing private Operations database and signed-in GitHub account. Apply `migrations/004_quotations.sql` after `001_operations.sql`, or allow the API database role to create the five tables on first use. The API fails closed if the tables cannot be reached. No supplier price file belongs in the public web directory or Git repository.

The owner grants quotation view, quotation edit, cost view and cost management separately to existing Operations accounts. Linked quotations also require the corresponding Job scope. Standalone quotations belong to their creator and the owner and can be shared with named users who also have quotation access. Cost data is excluded from responses when cost access is absent, and changes to customer-facing fields preserve existing hidden cost data.

From **Quotation / PDA / FDA**, an authorized cost manager can open **ต้นทุนอ้างอิง** and import the locally prepared JSON review file. Imported entries are pending until reviewed and approved individually. Review the original PDF, unit, VAT, conditions and effective dates; incomplete or contradictory items need a confirmed amount before approval. The import file contains confidential supplier prices and must be kept private. Do not check it into Git or publish it as a web asset.

A quotation may be saved as a draft before all fields are known. The user supplies and confirms any exchange rate; changing currency or rate presents the converted selling prices before applying the change. Export and marking sent require complete customer-facing fields. Exports use a customer-only projection. Marking sent explicitly saves a revision; editing afterward starts a new revision. A quotation update uses a version check, and stale saves must be reloaded and reviewed.

For local verification run `node --test tests/quotation.test.mjs tests/operations.test.mjs tests/operations-api.test.mjs`. Production use requires the deployment and database to be verified separately; review and approve supplier prices before using them in a quotation.
