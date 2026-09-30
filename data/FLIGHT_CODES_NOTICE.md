# Flight code data notice

`flight-codes.json` powers suggestions in the HarborFlow pilot. It is not the official live IATA directory and must not be used as the sole source for operational decisions.

## Sources and licenses

- Airport records are derived from [OurAirports](https://ourairports.com/data/), which releases its data to the Public Domain.
- Airline records are derived from [OpenFlights](https://openflights.org/data.php), available under the [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/) with individual contents under the [Database Contents License 1.0](https://opendatacommons.org/licenses/dbcl/1-0/).

The derived `flight-codes.json` database is made available under ODbL 1.0. This notice does not change the license of the HarborFlow application code.

OpenFlights states that its airline snapshot is updated only sporadically and that its active-airline flag may be unreliable. Users must verify airline and airport codes before operational use.

Run `node scripts/update-flight-codes.mjs` to regenerate the data from the source URLs recorded in that script.

