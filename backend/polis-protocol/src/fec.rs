use firestore::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

const PROJECT_ID: &str = "stanseproject";

/// FEC Company Party Summary Response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompanyDonationData {
    pub company_name: String,
    pub normalized_name: String,
    pub total_contributed: f64,
    pub party_totals: HashMap<String, PartyTotal>,
    pub data_years: Vec<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PartyTotal {
    pub total_amount: f64,
    pub contribution_count: u64,
}

/// Firestore client wrapper
pub struct FecClient {
    db: Option<FirestoreDb>,
}

impl FecClient {
    /// Create a new FEC client
    pub async fn new() -> Result<Self, Box<dyn std::error::Error>> {
        // Try to initialize Firestore client
        match FirestoreDb::new(PROJECT_ID).await {
            Ok(db) => Ok(Self { db: Some(db) }),
            Err(e) => {
                eprintln!("Warning: Failed to initialize Firestore client: {}. FEC queries will return None.", e);
                Ok(Self { db: None })
            }
        }
    }

    /// Normalize company name for search (same logic as Python script)
    fn normalize_company_name(name: &str) -> String {
        let mut normalized = name.to_lowercase();

        // Remove common suffixes
        let suffixes = [
            "corporation", "corp", "inc", "incorporated", "company", "co",
            "llc", "lp", "ltd", "limited", "political action committee", "pac",
        ];

        for suffix in &suffixes {
            normalized = normalized.replace(&format!(" {}", suffix), "");
            normalized = normalized.replace(&format!(" {}.", suffix), "");
        }

        // Remove punctuation and extra spaces
        normalized = normalized
            .chars()
            .filter(|c| c.is_alphanumeric() || c.is_whitespace())
            .collect();

        // Normalize whitespace
        normalized.split_whitespace().collect::<Vec<_>>().join(" ")
    }

    /// Query company donation data by company name
    pub async fn query_company_donations(
        &self,
        company_name: &str,
    ) -> Result<Option<CompanyDonationData>, Box<dyn std::error::Error>> {
        // If Firestore client is not available, return None
        let db = match &self.db {
            Some(db) => db,
            None => return Ok(None),
        };

        // Normalize the company name for lookup
        let normalized = Self::normalize_company_name(company_name);

        println!("Querying FEC data for company: {} (normalized: {})", company_name, normalized);

        // First, look up the company in fec_company_index
        let company_index_result: Option<FirestoreResult<HashMap<String, serde_json::Value>>> = db
            .fluent()
            .select()
            .by_id_in("fec_company_index")
            .obj()
            .one(&normalized)
            .await?;

        if company_index_result.is_none() {
            println!("Company not found in index: {}", normalized);
            return Ok(None);
        }

        // Query all summaries for this company (across all years)
        let summaries: Vec<HashMap<String, serde_json::Value>> = db
            .fluent()
            .select()
            .from("fec_company_party_summary")
            .filter(|q| q.for_all([q.field("normalized_name").eq(&normalized)]))
            .obj()
            .query()
            .await?;

        if summaries.is_empty() {
            println!("No donation summaries found for: {}", normalized);
            return Ok(None);
        }

        // Aggregate data across all years
        let mut party_totals: HashMap<String, PartyTotal> = HashMap::new();
        let mut total_contributed = 0.0;
        let mut data_years: Vec<i32> = Vec::new();
        let mut company_display_name = company_name.to_string();

        for summary in summaries {
            // Extract company name for display
            if let Some(name) = summary.get("company_name").and_then(|v| v.as_str()) {
                company_display_name = name.to_string();
            }

            // Extract year
            if let Some(year) = summary.get("data_year").and_then(|v| v.as_i64()) {
                data_years.push(year as i32);
            }

            // Extract total contributed for this year
            if let Some(total) = summary.get("total_contributed").and_then(|v| v.as_f64()) {
                total_contributed += total / 100.0; // Convert cents to dollars
            }

            // Extract party totals
            if let Some(party_data) = summary.get("party_totals").and_then(|v| v.as_object()) {
                for (party, data) in party_data {
                    let amount = data
                        .get("total_amount")
                        .and_then(|v| v.as_f64())
                        .unwrap_or(0.0)
                        / 100.0; // Convert cents to dollars

                    let count = data
                        .get("contribution_count")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0);

                    party_totals
                        .entry(party.clone())
                        .and_modify(|e| {
                            e.total_amount += amount;
                            e.contribution_count += count;
                        })
                        .or_insert(PartyTotal {
                            total_amount: amount,
                            contribution_count: count,
                        });
                }
            }
        }

        data_years.sort();
        data_years.dedup();

        println!(
            "Found FEC data for {}: ${:.2} total across {} years",
            company_display_name,
            total_contributed,
            data_years.len()
        );

        Ok(Some(CompanyDonationData {
            company_name: company_display_name,
            normalized_name: normalized,
            total_contributed,
            party_totals,
            data_years,
        }))
    }

    /// Calculate party percentages for visualization
    pub fn calculate_party_percentages(data: &CompanyDonationData) -> HashMap<String, f64> {
        let mut percentages = HashMap::new();

        if data.total_contributed == 0.0 {
            return percentages;
        }

        for (party, totals) in &data.party_totals {
            let percentage = (totals.total_amount / data.total_contributed) * 100.0;
            percentages.insert(party.clone(), percentage);
        }

        percentages
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_company_name() {
        assert_eq!(
            FecClient::normalize_company_name("JPMorgan Chase & Co."),
            "jpmorgan chase"
        );
        assert_eq!(
            FecClient::normalize_company_name("Goldman Sachs Group, Inc."),
            "goldman sachs group"
        );
        assert_eq!(
            FecClient::normalize_company_name("Microsoft Corporation"),
            "microsoft"
        );
        assert_eq!(
            FecClient::normalize_company_name("The Boeing Company"),
            "the boeing"
        );
    }
}
