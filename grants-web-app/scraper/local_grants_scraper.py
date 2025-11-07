#!/usr/bin/env python3
"""
Local Grants Web Scraper for Jacksonville/NE Florida
Searches for grant opportunities relevant to Villages of Hope
"""

import json
import sys
import os
import re
from datetime import datetime
from difflib import SequenceMatcher
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse

# Configuration
SEARCH_KEYWORDS = [
    "sex trafficking survivors Jacksonville",
    "human trafficking services Florida grants",
    "nonprofit grants Northeast Florida women",
    "violence against women funding Jacksonville",
    "survivor services grants Duval County",
    "victim advocacy funding First Coast"
]

TARGET_SOURCES = [
    # Community Foundations - specific grant pages
    {
        "url": "https://www.jaxcf.org/grants",
        "region": "Jacksonville",
        "name": "Jacksonville Community Foundation"
    },
    {
        "url": "https://www.jaxcf.org/nonprofit-grants",
        "region": "Jacksonville",
        "name": "JAX CF Nonprofit Grants"
    },
    # Florida Department of Children and Families - grants page
    {
        "url": "https://www.myflfamilies.com/service-programs/grants/",
        "region": "NE Florida",
        "name": "FL Dept of Children & Families"
    },
    # Jacksonville government grants
    {
        "url": "https://www.coj.net/departments/neighborhoods/grants",
        "region": "Jacksonville",
        "name": "City of Jacksonville"
    },
    # Florida Women's Funding Network
    {
        "url": "https://www.fwfn.org/grants",
        "region": "NE Florida",
        "name": "Florida Women's Funding Network"
    }
]

RELEVANT_KEYWORDS = [
    "trafficking", "survivor", "victim", "violence against women",
    "domestic violence", "sexual assault", "homeless women", "housing",
    "counseling", "mental health", "vocational training", "nonprofit",
    "501(c)(3)", "social services", "women's services", "victim services"
]

class LocalGrantsScraper:
    def __init__(self, max_results=20):
        self.max_results = max_results
        self.found_grants = []
        self.seen_urls = set()

    def normalize_url(self, url):
        """Normalize URL for comparison"""
        parsed = urlparse(url)
        # Remove query parameters and fragments for comparison
        return f"{parsed.scheme}://{parsed.netloc}{parsed.path}".rstrip('/')

    def calculate_similarity(self, str1, str2):
        """Calculate similarity between two strings"""
        return SequenceMatcher(None, str1.lower(), str2.lower()).ratio()

    def is_duplicate(self, url, title):
        """Check if grant is duplicate based on URL or title similarity"""
        normalized_url = self.normalize_url(url)

        # Check URL match
        if normalized_url in self.seen_urls:
            return True

        # Check title similarity (85% threshold)
        for grant in self.found_grants:
            if self.calculate_similarity(title, grant['title']) > 0.85:
                return True

        return False

    def is_relevant(self, text):
        """Check if text contains relevant keywords"""
        text_lower = text.lower()
        return any(keyword in text_lower for keyword in RELEVANT_KEYWORDS)

    def extract_grant_info(self, url, soup, source_region):
        """Extract grant information from a page"""
        grants = []

        # Look for common grant patterns with more specific selectors
        potential_grants = []

        # Try multiple selector strategies
        # Strategy 1: Look for grant-specific classes/IDs
        potential_grants.extend(soup.find_all(['article', 'div', 'section'],
                                              class_=re.compile(r'(grant|funding|opportunity|program|award)', re.I)))

        # Strategy 2: Look for list items that might be grants
        potential_grants.extend(soup.find_all('li', class_=re.compile(r'(grant|opportunity)', re.I)))

        # Strategy 3: Look for headings that mention grants
        for heading in soup.find_all(['h2', 'h3', 'h4']):
            if re.search(r'(grant|funding|opportunity)', heading.get_text(), re.I):
                parent = heading.find_parent(['div', 'section', 'article'])
                if parent and parent not in potential_grants:
                    potential_grants.append(parent)

        print(f"Found {len(potential_grants)} potential grant elements to analyze", file=sys.stderr)

        for element in potential_grants[:15]:  # Analyze more elements
            try:
                # Extract title
                title_elem = element.find(['h1', 'h2', 'h3', 'h4', 'a'])
                if not title_elem:
                    continue

                title = title_elem.get_text(strip=True)

                # Skip if title is too short or generic
                if len(title) < 10 or title.lower() in ['home', 'about', 'contact', 'news']:
                    continue

                # Extract link
                link_elem = element.find('a', href=True)
                if link_elem:
                    grant_url = urljoin(url, link_elem['href'])
                else:
                    grant_url = url

                # Extract summary
                summary_elem = element.find(['p', 'div'], class_=re.compile(r'(description|summary|excerpt)', re.I))
                if not summary_elem:
                    # Get first paragraph
                    summary_elem = element.find('p')

                summary = summary_elem.get_text(strip=True)[:500] if summary_elem else ""

                # Extract deadline if present
                deadline = None
                deadline_patterns = [
                    r'deadline[:\s]+([A-Za-z]+\s+\d{1,2},?\s+\d{4})',
                    r'due[:\s]+([A-Za-z]+\s+\d{1,2},?\s+\d{4})',
                    r'closes?[:\s]+([A-Za-z]+\s+\d{1,2},?\s+\d{4})'
                ]

                text_content = element.get_text()
                for pattern in deadline_patterns:
                    match = re.search(pattern, text_content, re.I)
                    if match:
                        deadline = match.group(1)
                        break

                # Check relevance - be more lenient for local grants
                combined_text = f"{title} {summary}"
                # For Jacksonville/NE Florida sources, accept grants even without strict keyword matches
                # since local grants are likely relevant
                has_keywords = self.is_relevant(combined_text)
                is_local_grant = 'grant' in title.lower() or 'grant' in summary.lower()

                if not (has_keywords or is_local_grant):
                    continue

                # Check for duplicate
                if self.is_duplicate(grant_url, title):
                    continue

                grant_data = {
                    'title': title,
                    'url': grant_url,
                    'summary': summary,
                    'deadline': deadline,
                    'source': f"Web Scraped - {source_region}",
                    'found_date': datetime.now().isoformat()
                }

                grants.append(grant_data)
                self.seen_urls.add(self.normalize_url(grant_url))

            except Exception as e:
                # Skip problematic elements
                continue

        return grants

    def scrape_website(self, url, source_region="Jacksonville", source_name=""):
        """Scrape a specific website for grants"""
        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Connection': 'keep-alive',
            }

            print(f"Attempting to scrape: {source_name} ({url})", file=sys.stderr)
            response = requests.get(url, headers=headers, timeout=20, allow_redirects=True)
            response.raise_for_status()

            soup = BeautifulSoup(response.content, 'html.parser')

            # Extract grants
            grants = self.extract_grant_info(url, soup, source_region)

            if grants:
                print(f"Found {len(grants)} grants from {source_name}", file=sys.stderr)
            else:
                print(f"No grants found on {source_name}", file=sys.stderr)

            return grants

        except requests.exceptions.RequestException as e:
            print(f"Network error scraping {source_name}: {str(e)}", file=sys.stderr)
            return []
        except Exception as e:
            print(f"Error scraping {source_name}: {str(e)}", file=sys.stderr)
            return []

    def search_google(self, query, region="Jacksonville"):
        """
        Perform Google search for grants using Google Custom Search API
        """
        try:
            # Get API credentials from environment
            api_key = os.getenv('GOOGLE_API_KEY')
            cse_id = os.getenv('GOOGLE_CSE_ID')

            if not api_key or not cse_id:
                print("Google API credentials not found in environment", file=sys.stderr)
                return []

            # Google Custom Search API endpoint
            url = "https://www.googleapis.com/customsearch/v1"
            params = {
                'key': api_key,
                'cx': cse_id,
                'q': query,
                'num': 4  # Limit to 4 results as requested
            }

            print(f"Searching Google for: {query}", file=sys.stderr)
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()

            results = response.json()
            grants = []

            # Process search results
            if 'items' in results:
                for item in results['items']:
                    url = item.get('link', '')
                    title = item.get('title', '')
                    snippet = item.get('snippet', '')

                    combined_text = f"{title} {snippet} {url}"
                    combined_lower = combined_text.lower()

                    # Skip grant writing services and consultants
                    skip_terms = ['grant writing', 'grant writer', 'consulting', 'consultant', 'grant training']
                    if any(term in combined_lower for term in skip_terms):
                        print(f"Skipping grant writing service: {title}", file=sys.stderr)
                        continue

                    # Skip recipient press releases/announcements about receiving grants
                    recipient_terms = ['awarded', 'receives grant', 'received grant', 'wins grant', 'grant recipient']
                    if any(term in combined_lower for term in recipient_terms):
                        print(f"Skipping grant recipient announcement: {title}", file=sys.stderr)
                        continue

                    # Skip pure news articles
                    news_domains = ['cnn.com', 'foxnews.com', 'nbcnews.com', 'abcnews.com', 'cbsnews.com']
                    if any(domain in url.lower() for domain in news_domains):
                        print(f"Skipping news site: {title}", file=sys.stderr)
                        continue

                    # Must have Jacksonville/NE Florida location
                    location_terms = ['jacksonville', 'northeast florida', 'ne florida', 'duval county', 'first coast', 'florida']
                    has_location = any(term in combined_lower for term in location_terms)

                    if not has_location:
                        print(f"Skipping (not Jacksonville/NE Florida): {title}", file=sys.stderr)
                        continue

                    # Must have grant/funding terms
                    funding_terms = ['grant', 'funding', 'opportunity', 'rfp', 'application', 'apply', 'award']
                    has_funding = any(term in combined_lower for term in funding_terms)

                    if not has_funding:
                        print(f"Skipping (no funding terms): {title}", file=sys.stderr)
                        continue

                    # Accept if it's a grant database/directory OR has application terms
                    database_terms = ['grant database', 'funding opportunities', 'grant opportunities', 'available grants']
                    application_terms = ['application', 'apply', 'deadline', 'eligibility', 'how to apply', 'submit']

                    is_database = any(term in combined_lower for term in database_terms)
                    has_application = any(term in combined_lower for term in application_terms)

                    if not (is_database or has_application):
                        print(f"Skipping (not actionable): {title}", file=sys.stderr)
                        continue

                    # Check for duplicate
                    if self.is_duplicate(url, title):
                        continue

                    grant_data = {
                        'title': title,
                        'url': url,
                        'summary': snippet,
                        'deadline': None,
                        'source': f"Google Search - {region}",
                        'found_date': datetime.now().isoformat()
                    }

                    grants.append(grant_data)
                    self.seen_urls.add(self.normalize_url(url))

                print(f"Found {len(grants)} relevant grants from Google search", file=sys.stderr)
            else:
                print("No search results returned from Google", file=sys.stderr)

            return grants

        except Exception as e:
            print(f"Error searching Google: {str(e)}", file=sys.stderr)
            return []

    def scrape_all_sources(self):
        """Scrape all configured sources"""
        print("Starting local grants scraper for Jacksonville/NE Florida...", file=sys.stderr)

        # Scrape known websites
        for source in TARGET_SOURCES:
            if len(self.found_grants) >= self.max_results:
                break

            grants = self.scrape_website(
                source['url'],
                source['region'],
                source['name']
            )
            self.found_grants.extend(grants)

        # Perform web searches using Google API (limit to first keyword for 4 results max)
        if len(self.found_grants) < self.max_results:
            # Search for active grant opportunities in Jacksonville/NE Florida area
            # Focus on funding opportunities (not news) that nonprofits can apply to
            keyword = 'Jacksonville OR "Northeast Florida" OR "NE Florida" nonprofit grant funding opportunity open application'
            print("Performing Google Custom Search...", file=sys.stderr)
            grants = self.search_google(keyword, "Jacksonville")
            self.found_grants.extend(grants)

        # Limit to max results
        self.found_grants = self.found_grants[:self.max_results]

        print(f"Found {len(self.found_grants)} unique grant opportunities", file=sys.stderr)

        return self.found_grants

def main():
    """Main execution function"""
    try:
        scraper = LocalGrantsScraper(max_results=20)
        grants = scraper.scrape_all_sources()

        # Output results as JSON
        result = {
            'success': True,
            'count': len(grants),
            'grants': grants,
            'timestamp': datetime.now().isoformat()
        }

        print(json.dumps(result))
        sys.exit(0)

    except Exception as e:
        error_result = {
            'success': False,
            'error': str(e),
            'count': 0,
            'grants': []
        }
        print(json.dumps(error_result))
        sys.exit(1)

if __name__ == '__main__':
    main()
