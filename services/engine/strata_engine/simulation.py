"""Simulation Lab: a declarative library of business-disruption scenarios, played through the STRATA loop.

Every number here is a SCRIPTED COUNTERFACTUAL computed from the declared scenario parameters below
(provenance "illustrative"). Nothing is measured, nothing touches the synthetic dataset, nothing leaves the
machine: e-mails and customer messages in the event feed are simulated. The model is deterministic for a given
(scenario, horizon, seed, decision).

Model (per trajectory, impact I(t) in "share of the full shock", 0 = normal):
  - before onset I = 0; after onset it ramps to 1 over `ramp_days`, then keeps growing by `spread`/week while
    nobody acts (capped at 1.6);
  - it stops growing at the pivot = min(mitigation day, natural end of the event) and then decays towards a
    residual floor (`residual` x peak) with time constant `tau`;
  - KPI = base x (1 -/+ shock x I) (sign by the KPI's good direction) x small seeded noise.
Three trajectories: baseline (no incident), without_strata (late detection, slow manual response) and
with_strata (early detection through the loop, human-gated plan, faster recovery). The human-gate decision
(approve / let the agent decide at deadline / escalate) picks one of three pre-declared branches.

Agentic policy mirrored from the night-build contract (agentic lane): levels 1-5, default 2, human gate at
level >= 2, auto decision at deadline for level 1, provisional decision at deadline for levels 2-3, human-only
for levels 4-5, e-mail alerts from level 3. Regulatory-sensitive (quality) cases are always human-only and are
routed to qa_head: STRATA never gives clinical or safety advice.
"""

from __future__ import annotations

import math
import random
from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/sim", tags=["simulation"])

PROVENANCE = "illustrative"
CAPTION = "Scripted counterfactual from declared scenario parameters, not a measured result."
DEFAULT_SEED = 20261009
RECOVERED_AT = 0.15  # "recovered" = impact back within 15% of the full shock (and staying there)

POLICY: dict[str, Any] = {
    "default_level": 2, "human_threshold": 2,
    "deadlines_hours": {"1": 72, "2": 48, "3": 24, "4": 8, "5": 4},
    "auto_decide_max_level": 1, "provisional_max_level": 3, "email_min_level": 3,
}
LEVEL_LABEL = {1: "Low", 2: "Moderate", 3: "Elevated", 4: "High", 5: "Critical"}
_ROLE_FALLBACK = {
    "operations_manager": "Operations Manager", "account_manager": "Account Manager",
    "sales_manager": "Sales Manager", "support_manager": "Support Manager",
    "business_head": "Business Head", "qa_head": "QA Head",
}


def _role_label(role: str) -> str:
    try:
        from .config import ROLE_LABELS  # lazy: keeps this module importable on its own
        return ROLE_LABELS.get(role, _ROLE_FALLBACK.get(role, role))
    except Exception:  # pragma: no cover - config always importable in the engine
        return _ROLE_FALLBACK.get(role, role)


STAGES = [
    {"key": "observe", "label": "Observe"}, {"key": "detect", "label": "Detect"},
    {"key": "investigate", "label": "Investigate"}, {"key": "remember", "label": "Remember"},
    {"key": "act", "label": "Act"}, {"key": "learn", "label": "Learn"},
]

KPIS: list[dict[str, Any]] = [
    {"key": "revenue", "label": "Order value", "unit": "₹ lakh / week", "good": "up", "noise": 0.015},
    {"key": "service_level", "label": "Service level (OTIF)", "unit": "%", "good": "up", "noise": 0.006},
    {"key": "backlog", "label": "Order backlog", "unit": "open orders", "good": "down", "noise": 0.03},
    {"key": "complaints", "label": "Customer complaints", "unit": "per week", "good": "down", "noise": 0.05},
    {"key": "dso", "label": "Days sales outstanding", "unit": "days", "good": "down", "noise": 0.01},
    {"key": "cost_to_serve", "label": "Cost to serve", "unit": "% of order value", "good": "down", "noise": 0.012},
]
KPI = {k["key"]: k for k in KPIS}

# ---------------------------------------------------------------------------------------------------- industries
INDUSTRIES: list[dict[str, Any]] = [
    {"key": "pharma", "label": "Pharma & healthcare distribution",
     "blurb": "Stockists, chemist chains and hospital pharmacies; chronic-therapy SKUs. Matches the demo dataset.",
     "sources": ["orders", "warehouse stock", "carrier ETAs", "support tickets", "receivables"],
     "base": {"revenue": 180, "service_level": 95, "backlog": 140, "complaints": 12, "dso": 52, "cost_to_serve": 6.5},
     "ctx": {"site": "the Chennai DC", "alt_site": "the Bengaluru DC", "region": "Tamil Nadu", "account": "a tier-A stockist",
             "sku": "a chronic-therapy SKU", "partner": "the regional carrier", "lane": "the Delhi-Jaipur lane"}},
    {"key": "fmcg", "label": "FMCG / consumer goods",
     "blurb": "Distributors, super-stockists, modern and general trade; high volume, thin margins.",
     "sources": ["secondary sales", "depot stock", "transport bookings", "trade complaints", "distributor ledgers"],
     "base": {"revenue": 620, "service_level": 93, "backlog": 900, "complaints": 40, "dso": 28, "cost_to_serve": 9.0},
     "ctx": {"site": "the Guwahati depot", "alt_site": "the Siliguri depot", "region": "the North-East", "account": "a top super-stockist",
             "sku": "a fast-moving SKU", "partner": "the primary transporter", "lane": "the Kolkata-Guwahati lane"}},
    {"key": "manufacturing", "label": "Manufacturing (auto components)",
     "blurb": "Tier-1 supplier to vehicle makers; just-in-time schedules, line-side delivery.",
     "sources": ["OEM schedules", "MES / production", "supplier ASNs", "quality NCRs", "receivables"],
     "base": {"revenue": 950, "service_level": 97, "backlog": 60, "complaints": 6, "dso": 62, "cost_to_serve": 5.5},
     "ctx": {"site": "the Manesar plant", "alt_site": "the Pune plant", "region": "the NCR cluster", "account": "the largest OEM customer",
             "sku": "brake assemblies", "partner": "the milk-run operator", "lane": "the Pune-Manesar lane"}},
    {"key": "ecommerce", "label": "E-commerce & retail",
     "blurb": "Marketplace and own-brand stores; fulfilment centres, courier partners, delivery promises.",
     "sources": ["web orders", "fulfilment centre scans", "courier tracking", "customer contacts", "settlements"],
     "base": {"revenue": 410, "service_level": 92, "backlog": 2600, "complaints": 300, "dso": 9, "cost_to_serve": 13.0},
     "ctx": {"site": "the Bhiwandi fulfilment centre", "alt_site": "the Nagpur fulfilment centre", "region": "West India",
             "account": "a top seller cohort", "sku": "fragile home goods", "partner": "the last-mile courier", "lane": "Mumbai metro last mile"}},
    {"key": "logistics", "label": "Logistics / 3PL",
     "blurb": "Warehousing and transport for many clients; utilisation, SLAs and claims.",
     "sources": ["TMS trips", "WMS scans", "GPS / ETA", "client tickets", "invoices"],
     "base": {"revenue": 300, "service_level": 94, "backlog": 450, "complaints": 25, "dso": 58, "cost_to_serve": 11.0},
     "ctx": {"site": "the Chennai hub", "alt_site": "the Hosur hub", "region": "South India", "account": "the largest e-commerce client",
             "sku": "client consignments", "partner": "a subcontracted fleet", "lane": "the Chennai-Bengaluru lane"}},
    {"key": "food", "label": "Food & cold chain",
     "blurb": "Dairy, frozen and ready-to-eat; temperature-controlled storage and reefers, short shelf life.",
     "sources": ["orders", "cold-store sensors", "reefer telemetry", "complaints", "receivables"],
     "base": {"revenue": 260, "service_level": 96, "backlog": 320, "complaints": 22, "dso": 21, "cost_to_serve": 10.5},
     "ctx": {"site": "the Nagpur cold store", "alt_site": "the Hyderabad cold store", "region": "Central India", "account": "a QSR chain",
             "sku": "chilled dairy", "partner": "the reefer operator", "lane": "the Pune-Hyderabad lane"}},
]
IND = {i["key"]: i for i in INDUSTRIES}

# ---------------------------------------------------------------------------------------------------- categories
# Each category declares a response profile. Scenario entries may override any key (e.g. sev, peak_level, lags).
CATEGORIES: list[dict[str, Any]] = [
    {"key": "natural_disaster", "label": "Natural disaster", "profile": {
        "primary": "service_level", "horizon": 16, "onset_day": 3,
        "shocks": {"revenue": .28, "service_level": .30, "backlog": 1.4, "complaints": 1.1, "dso": .06, "cost_to_serve": .35},
        "ramp_days": 2, "spread": .05, "duration_days": None, "lag_with": .25, "lag_without": 6, "respond_without": 5,
        "exec_lag": 1.0, "tau_with_w": 1.6, "tau_without_w": 4.0, "residual_with": .0, "residual_without": .08,
        "start_level": 3, "peak_level": 4, "owner": "operations_manager", "notify": ["operations_manager", "account_manager"],
        "signals": ["Weather and news feed: severe event near {site}", "Scans at {site} down 70% vs the same hour last week",
                    "Carrier ETAs slip on open consignments out of {site}", "Damage reports logged against {site} stock"],
        "causes": ["Site disruption at {site}", "carrier capacity shortage", "a real demand drop in {region}"],
        "memory": "Similar past case: flood at a regional DC (illustrative memory item). What worked: divert within 24 h, count damage before claims, call top accounts first.",
        "without_source": "Branch managers phone in losses; the first consolidated picture appears at the weekly review.",
        "playbook": [("operations_manager", "Divert open orders from {site} to {alt_site}", "internal"),
                     ("operations_manager", "Quarantine and count damaged stock; open the insurance survey", "internal"),
                     ("account_manager", "Call top accounts in {region} with new ETAs and the alternate source", "external"),
                     ("sales_manager", "Pause promotions in the affected territory for two weeks", "internal"),
                     ("business_head", "Release the expedited-freight budget", "internal")],
        "auto_side": "Re-routed 14 low-value replenishment orders to {alt_site}"}},
    {"key": "late_shipment", "label": "Late shipment / port congestion", "profile": {
        "primary": "service_level", "horizon": 14, "onset_day": 4,
        "shocks": {"revenue": .15, "service_level": .22, "backlog": 1.0, "complaints": .7, "dso": .03, "cost_to_serve": .15},
        "ramp_days": 7, "spread": .08, "duration_days": None, "lag_with": 1.0, "lag_without": 12, "respond_without": 4,
        "exec_lag": 1.5, "tau_with_w": 1.5, "tau_without_w": 3.5, "residual_with": .0, "residual_without": .05,
        "start_level": 2, "peak_level": 3, "owner": "operations_manager", "notify": ["operations_manager", "account_manager"],
        "signals": ["Carrier ETA for the inbound shipment slips by 9 days", "Inbound stock cover for {sku} falls below 7 days",
                    "Port dwell time on the lane up sharply this week", "Backorders open on {sku} at several accounts"],
        "causes": ["Port congestion on the import lane", "supplier dispatch delay", "a documentation hold"],
        "memory": "Similar past case: port backlog on an import lane (illustrative memory item). What worked: split the shipment, air-freight the fast movers, allocate by service tier.",
        "without_source": "Stock-outs show up as order rejections; buyers chase the forwarder by e-mail.",
        "playbook": [("operations_manager", "Air-freight the part of the shipment that covers fast movers", "internal"),
                     ("operations_manager", "Allocate available stock to priority accounts by service tier", "internal"),
                     ("account_manager", "Send revised delivery dates to affected accounts", "external"),
                     ("sales_manager", "Offer a substitute SKU where one exists", "external")],
        "auto_side": "Re-sequenced 22 warehouse picks to protect priority accounts"}},
    {"key": "transit_damage", "label": "Damage in transit", "profile": {
        "primary": "complaints", "horizon": 14, "onset_day": 3,
        "shocks": {"revenue": .08, "service_level": .12, "backlog": .4, "complaints": 1.6, "dso": .04, "cost_to_serve": .25},
        "ramp_days": 5, "spread": .10, "duration_days": None, "lag_with": 2.0, "lag_without": 14, "respond_without": 7,
        "exec_lag": 1.0, "tau_with_w": 1.5, "tau_without_w": 4.0, "residual_with": .0, "residual_without": .06,
        "start_level": 2, "peak_level": 3, "owner": "operations_manager", "notify": ["operations_manager", "support_manager"],
        "signals": ["Damage-on-delivery claims on {lane} up 3x week on week", "Proof-of-delivery photos flag crushed or open cartons",
                    "Returns tagged 'damaged' cluster on {partner}", "Complaint text mentions 'broken' or 'leaking' repeatedly"],
        "causes": ["Handling at {partner}", "a packaging specification change", "a vehicle-type change on {lane}"],
        "memory": "Similar past case: damage spike after a carrier changed vehicles (illustrative memory item). What worked: switch partner on the lane, reinforce packs, pre-approve credits.",
        "without_source": "Claims pile up in the support queue; finance spots the credit-note spike at month end.",
        "playbook": [("operations_manager", "Move {lane} volume from {partner} to the backup carrier", "internal"),
                     ("operations_manager", "Add reinforced packs for fragile SKUs", "internal"),
                     ("support_manager", "Pre-approve replacement or credit for affected orders", "external"),
                     ("account_manager", "Raise a claim and a corrective-action request with {partner}", "external")],
        "auto_side": "Auto-approved 9 low-value replacements under the claims limit"}},
    {"key": "supplier_failure", "label": "Supplier failure", "profile": {
        "primary": "service_level", "horizon": 20, "onset_day": 4,
        "shocks": {"revenue": .25, "service_level": .28, "backlog": 1.1, "complaints": .8, "dso": .03, "cost_to_serve": .18},
        "ramp_days": 10, "spread": .07, "duration_days": None, "lag_with": 3.0, "lag_without": 18, "respond_without": 6,
        "exec_lag": 2.0, "tau_with_w": 2.0, "tau_without_w": 5.0, "residual_with": .02, "residual_without": .10,
        "start_level": 2, "peak_level": 4, "owner": "operations_manager", "notify": ["operations_manager", "account_manager"],
        "signals": ["{supplier} confirms only 55% of the open purchase order", "Inbound ASN for {sku} missing for two cycles",
                    "Stock cover for {sku} below 10 days", "Fill rate on {sku} drops at several key accounts"],
        "causes": ["Capacity failure at {supplier}", "raw-material shortage upstream", "a forecast error"],
        "memory": "Similar past case: supplier delay hurting a key account (illustrative memory item). What worked: reallocate stock, escalate the supplier, call the customer early.",
        "without_source": "The account manager hears about short supplies from the customer weeks later.",
        "playbook": [("operations_manager", "Qualify the second source for {sku} and place a bridge order", "external"),
                     ("operations_manager", "Reallocate stock from lower-priority accounts", "internal"),
                     ("business_head", "Escalate to {supplier} leadership with a recovery-date ask", "external"),
                     ("account_manager", "Brief affected accounts with dates and substitutes", "external")],
        "auto_side": "Raised safety-stock alert levels on 6 dependent SKUs"}},
    {"key": "demand_spike", "label": "Demand spike & stock-out", "profile": {
        "primary": "service_level", "horizon": 12, "onset_day": 3,
        "shocks": {"revenue": .12, "service_level": .25, "backlog": 1.5, "complaints": .9, "dso": .0, "cost_to_serve": .12},
        "ramp_days": 4, "spread": .06, "duration_days": 28, "lag_with": 1.0, "lag_without": 9, "respond_without": 5,
        "exec_lag": 1.5, "tau_with_w": 1.0, "tau_without_w": 2.5, "residual_with": .0, "residual_without": .04,
        "start_level": 2, "peak_level": 3, "owner": "operations_manager", "notify": ["operations_manager", "sales_manager"],
        "signals": ["Orders for {sku} up 60% vs forecast for three days", "Stock cover in {region} falls to 4 days",
                    "Data Health Guard: order feed is fresh and not duplicated, so the spike is real",
                    "Lost-order reasons cite 'out of stock'"],
        "causes": ["A real demand shift", "a one-off bulk order", "duplicated rows in the order feed"],
        "memory": "Similar past case: seasonal surge handled with inter-depot transfers (illustrative memory item). What worked: transfer early, cap per-account allocation, add a shift.",
        "without_source": "The field team reports stock-outs after shelves are already empty.",
        "playbook": [("operations_manager", "Transfer stock to {region} from slower depots", "internal"),
                     ("sales_manager", "Cap per-account allocation so no single buyer empties stock", "external"),
                     ("operations_manager", "Add a production or packing shift", "internal"),
                     ("account_manager", "Confirm delivery windows with top accounts", "external")],
        "auto_side": "Raised replenishment for 30 outlets within the auto-order limit"}},
    {"key": "quality_recall", "label": "Quality issue / recall", "profile": {
        "primary": "complaints", "horizon": 20, "onset_day": 4, "regulatory": True,
        "shocks": {"revenue": .18, "service_level": .15, "backlog": .5, "complaints": 2.0, "dso": .05, "cost_to_serve": .30},
        "ramp_days": 6, "spread": .06, "duration_days": None, "lag_with": 1.0, "lag_without": 10, "respond_without": 5,
        "exec_lag": 1.0, "tau_with_w": 2.2, "tau_without_w": 5.0, "residual_with": .03, "residual_without": .12,
        "start_level": 3, "peak_level": 5, "owner": "qa_head", "notify": ["qa_head", "operations_manager", "business_head"],
        "signals": ["Several complaints on lot {lot} within days", "Complaints come from unrelated accounts in different regions",
                    "Complaint text clusters on one defect description", "Returns on lot {lot} above normal"],
        "causes": ["A lot-specific defect in {lot} (QA to confirm)", "handling damage in transit", "coincidental complaints"],
        "memory": "SOP: batch-complaint triage (illustrative draft). STRATA routes to QA with four-eyes review; it never advises on safety.",
        "without_source": "Complaints sit in separate inboxes; QA learns of the cluster at the monthly review.",
        "playbook": [("qa_head", "Review the evidence pack; decide hold or recall under the QA SOP", "internal"),
                     ("operations_manager", "Hold unsold units of lot {lot} in the warehouse pending the QA decision", "internal"),
                     ("operations_manager", "Trace every account that received lot {lot}", "internal"),
                     ("account_manager", "Inform affected accounts using QA-approved wording only", "external")],
        "auto_side": None}},
    {"key": "payment_default", "label": "Payment default / credit stress", "profile": {
        "primary": "dso", "horizon": 20, "onset_day": 4,
        "shocks": {"revenue": .12, "service_level": .02, "backlog": .1, "complaints": .3, "dso": .55, "cost_to_serve": .05},
        "ramp_days": 14, "spread": .05, "duration_days": None, "lag_with": 4.0, "lag_without": 25, "respond_without": 7,
        "exec_lag": 2.0, "tau_with_w": 2.5, "tau_without_w": 6.0, "residual_with": .05, "residual_without": .20,
        "start_level": 2, "peak_level": 4, "owner": "account_manager", "notify": ["account_manager", "business_head"],
        "signals": ["Overdue ratio at {account} rises from 4% to 27%", "Promised payment dates missed twice",
                    "Order volume at {account} down 22%", "Billing disputes logged by {account}"],
        "causes": ["Cash stress at {account}", "a billing dispute", "a seasonal slowdown"],
        "memory": "SOP: credit hold with a relationship call (illustrative draft). What worked: a dated payment plan before any hard hold.",
        "without_source": "Finance notices at the month-end ageing review; sales keeps shipping on credit.",
        "playbook": [("account_manager", "Meet {account} finance; agree a dated payment plan", "external"),
                     ("business_head", "Set a temporary credit limit; new orders against advance", "internal"),
                     ("sales_manager", "Shift scheme stock to accounts with clean ledgers", "internal"),
                     ("support_manager", "Resolve the open billing disputes within five days", "external")],
        "auto_side": "Paused auto-replenishment for {account} above the credit limit"}},
    {"key": "account_churn", "label": "Key-account churn", "profile": {
        "primary": "revenue", "horizon": 26, "onset_day": 5,
        "shocks": {"revenue": .18, "service_level": .0, "backlog": .0, "complaints": .5, "dso": .10, "cost_to_serve": .08},
        "ramp_days": 21, "spread": .03, "duration_days": None, "lag_with": 6.0, "lag_without": 35, "respond_without": 10,
        "exec_lag": 3.0, "tau_with_w": 3.0, "tau_without_w": 8.0, "residual_with": .08, "residual_without": .60,
        "start_level": 2, "peak_level": 3, "owner": "sales_manager", "notify": ["sales_manager", "account_manager"],
        "signals": ["Order frequency at {account} down 30% over four weeks", "Field visits to {account} fell from weekly to monthly",
                    "Unresolved complaints at {account} older than 10 days", "{account} asked for a tender pack"],
        "causes": ["A competitor offer to {account}", "repeated service failures", "a real decline in {account}'s business"],
        "memory": "Similar past case: key-account save with a joint business plan (illustrative memory item). What worked: senior visit within a week, fix service first, then terms.",
        "without_source": "The account team learns at the quarterly review that volume has moved.",
        "playbook": [("sales_manager", "Senior visit to {account} within five days", "external"),
                     ("support_manager", "Close every open complaint at {account}", "external"),
                     ("account_manager", "Offer a joint business plan with service commitments", "external"),
                     ("business_head", "Approve a time-bound commercial improvement", "internal")],
        "auto_side": "Created a weekly check-in task for {account} (internal)"}},
    {"key": "it_outage", "label": "IT / cyber outage", "profile": {
        "primary": "backlog", "horizon": 12, "onset_day": 3,
        "shocks": {"revenue": .35, "service_level": .40, "backlog": 2.5, "complaints": 1.4, "dso": .04, "cost_to_serve": .20},
        "ramp_days": .5, "spread": .0, "duration_days": 3, "lag_with": .05, "lag_without": .4, "respond_without": 3,
        "exec_lag": .25, "tau_with_w": .8, "tau_without_w": 2.0, "residual_with": .0, "residual_without": .03,
        "start_level": 3, "peak_level": 4, "owner": "operations_manager", "notify": ["operations_manager", "support_manager", "business_head"],
        "signals": ["{system} heartbeat lost; order intake stalls", "Order backlog rising every hour",
                    "Support tickets mention 'cannot place order'", "Partner EDI acknowledgements stop"],
        "causes": ["{system} outage", "a network failure at one site", "an upstream partner outage"],
        "memory": "Runbook: degraded-mode operations (illustrative draft). What worked: manual capture for top accounts, a priority queue, an early customer notice.",
        "without_source": "Teams notice quickly but work in silos: no single backlog view and no customer message for days.",
        "playbook": [("operations_manager", "Switch to degraded mode: manual order capture for top accounts", "internal"),
                     ("support_manager", "Post a status notice and a proactive customer message", "external"),
                     ("operations_manager", "Run a priority queue to burn down the backlog after restore", "internal"),
                     ("business_head", "Approve incident communications and overtime", "internal")],
        "auto_side": "Auto-retried 40 failed order syncs after restore"}},
    {"key": "labour_strike", "label": "Labour strike", "profile": {
        "primary": "service_level", "horizon": 14, "onset_day": 3,
        "shocks": {"revenue": .25, "service_level": .35, "backlog": 1.6, "complaints": .9, "dso": .03, "cost_to_serve": .25},
        "ramp_days": 1, "spread": .04, "duration_days": 5, "lag_with": .5, "lag_without": 3, "respond_without": 4,
        "exec_lag": 1.0, "tau_with_w": 1.3, "tau_without_w": 3.0, "residual_with": .0, "residual_without": .04,
        "start_level": 3, "peak_level": 4, "owner": "operations_manager", "notify": ["operations_manager", "account_manager"],
        "signals": ["News feed: strike called affecting {site}", "Shift attendance at {site} down 60%",
                    "Dispatches from {site} down 55% vs plan", "Carrier capacity on {lane} withdrawn"],
        "causes": ["Strike affecting {site}", "a local holiday", "a dispatch-system issue"],
        "memory": "Similar past case: transport strike covered by alternate depots and standby carriers (illustrative memory item).",
        "without_source": "Dispatch supervisors escalate by phone; plans change day by day.",
        "playbook": [("operations_manager", "Shift dispatch to {alt_site} and book standby carriers", "external"),
                     ("operations_manager", "Prioritise essential and high-value orders", "internal"),
                     ("account_manager", "Tell accounts the new dispatch plan", "external"),
                     ("business_head", "Engage the union or association through HR", "internal")],
        "auto_side": "Re-booked 18 small consignments on the parcel network"}},
    {"key": "regulatory_change", "label": "Regulatory / price-cap change", "profile": {
        "primary": "revenue", "horizon": 26, "onset_day": 5,
        "shocks": {"revenue": .14, "service_level": .05, "backlog": .3, "complaints": .3, "dso": .05, "cost_to_serve": .12},
        "ramp_days": 14, "spread": .02, "duration_days": None, "lag_with": 1.0, "lag_without": 20, "respond_without": 10,
        "exec_lag": 3.0, "tau_with_w": 2.5, "tau_without_w": 6.0, "residual_with": .08, "residual_without": .35,
        "start_level": 2, "peak_level": 3, "owner": "business_head", "notify": ["business_head", "sales_manager"],
        "signals": ["Regulatory feed: {rule}", "SKUs in scope of the change identified in the catalogue",
                    "Margin on affected SKUs drops at the new terms", "Channel partners ask about old-stock treatment"],
        "causes": ["{rule}", "competitor repricing", "seasonal mix"],
        "memory": "SOP: regulatory-change checklist (illustrative draft). What worked: map SKUs on day one, re-price and relabel, brief the channel.",
        "without_source": "The circular is read late; relabelling and repricing start only near the deadline.",
        "playbook": [("business_head", "Confirm the SKU list in scope and the compliance date", "internal"),
                     ("operations_manager", "Re-price or relabel stock in scope", "internal"),
                     ("sales_manager", "Shift the mix toward unaffected SKUs", "internal"),
                     ("account_manager", "Brief channel partners on old-stock handling", "external")],
        "auto_side": "Flagged 120 price-list rows for review (no change made)"}},
    {"key": "cost_spike", "label": "Cost / fuel spike", "profile": {
        "primary": "cost_to_serve", "horizon": 20, "onset_day": 4,
        "shocks": {"revenue": .03, "service_level": .03, "backlog": .1, "complaints": .1, "dso": .02, "cost_to_serve": .45},
        "ramp_days": 5, "spread": .03, "duration_days": None, "lag_with": 2.0, "lag_without": 30, "respond_without": 10,
        "exec_lag": 3.0, "tau_with_w": 2.5, "tau_without_w": 7.0, "residual_with": .08, "residual_without": .40,
        "start_level": 2, "peak_level": 3, "owner": "operations_manager", "notify": ["operations_manager", "business_head"],
        "signals": ["Input price index: {input} up sharply this month", "Freight invoices up on {lane}",
                    "Cost to serve per order above budget for two weeks", "Contracts without escalation clauses identified"],
        "causes": ["{input} price spike", "route inefficiency", "smaller drop sizes"],
        "memory": "Similar past case: surcharge renegotiation plus load consolidation (illustrative memory item).",
        "without_source": "The margin hit shows up in the month-end P&L.",
        "playbook": [("operations_manager", "Consolidate loads and raise minimum drop sizes", "internal"),
                     ("business_head", "Activate surcharge or escalation clauses where contracts allow", "external"),
                     ("sales_manager", "Re-price low-margin SKUs and small accounts", "external"),
                     ("operations_manager", "Re-tender the three costliest lanes", "external")],
        "auto_side": "Merged 11 part-loads into full loads within routing rules"}},
    {"key": "price_war", "label": "Competitor price war", "profile": {
        "primary": "revenue", "horizon": 20, "onset_day": 4,
        "shocks": {"revenue": .22, "service_level": .0, "backlog": .0, "complaints": .2, "dso": .05, "cost_to_serve": .10},
        "ramp_days": 10, "spread": .05, "duration_days": None, "lag_with": 3.0, "lag_without": 21, "respond_without": 7,
        "exec_lag": 2.0, "tau_with_w": 2.5, "tau_without_w": 6.0, "residual_with": .08, "residual_without": .35,
        "start_level": 2, "peak_level": 3, "owner": "sales_manager", "notify": ["sales_manager", "business_head"],
        "signals": ["Competitor price on {sku} down 15% in {channel}", "Our share in {channel} down for two weeks",
                    "Quote win-rate falls", "Distributors ask for matching schemes"],
        "causes": ["Competitor price cut in {channel}", "our own stock-outs", "a seasonal dip"],
        "memory": "Similar past case: targeted defence instead of a blanket discount (illustrative memory item).",
        "without_source": "Sales sees the drop in the monthly secondary-sales report.",
        "playbook": [("sales_manager", "Defend the top 20 outlets or listings with targeted schemes", "external"),
                     ("business_head", "Set a price floor; no blanket discounts", "internal"),
                     ("account_manager", "Bundle service terms (delivery, credit) instead of price", "external"),
                     ("operations_manager", "Keep stock of contested SKUs above two weeks", "internal")],
        "auto_side": "Alerted on 35 listings priced below the floor (no change made)"}},
]
CAT = {c["key"]: c for c in CATEGORIES}


def _sc(sid: str, industry: str, category: str, title: str, one_liner: str, trigger: str, **over: Any) -> dict[str, Any]:
    ctx = over.pop("ctx", {})
    return {"id": sid, "industry": industry, "category": category, "title": title, "one_liner": one_liner,
            "trigger": trigger, "ctx": ctx, "overrides": over}


# ---------------------------------------------------------------------------------------------------- scenarios
SCENARIOS: list[dict[str, Any]] = [
    # --- Pharma & healthcare distribution
    _sc("pharma-cyclone-chennai", "pharma", "natural_disaster", "Cyclone floods the Chennai DC",
        "30% of stock water-damaged; South Tamil Nadu stockists go short.",
        "Cyclone makes landfall near Chennai; the DC floods and 30% of stock is water-damaged.", sev=1.1),
    _sc("pharma-port-jnpt", "pharma", "late_shipment", "Import consignment stuck at JNPT",
        "Renal-care imports held 11 days in port congestion.",
        "Congestion at JNPT holds an imported renal-care consignment for 11 days.",
        ctx={"sku": "imported renal-care SKUs"}),
    _sc("pharma-transit-crush", "pharma", "transit_damage", "Crushed cartons on the Ludhiana route",
        "8% of deliveries on one route arrive damaged.",
        "A new carrier on the Ludhiana route stacks cartons badly; 8% of deliveries arrive crushed.",
        ctx={"lane": "the Ludhiana route", "partner": "the new Ludhiana carrier"}),
    _sc("pharma-supplier-slip", "pharma", "supplier_failure", "Formulation supplier slips three weeks",
        "Fill rate for a chronic-therapy SKU falls from 94% to 62% at a key stockist.",
        "The contract manufacturer of a chronic-therapy SKU slips its dispatch by three weeks.",
        ctx={"supplier": "the contract manufacturer"}),
    _sc("pharma-dengue-spike", "pharma", "demand_spike", "Dengue season demand spike",
        "Paracetamol and ORS demand up 70% in UP West.",
        "An early dengue season pushes paracetamol and ORS demand up 70% in UP West.",
        ctx={"sku": "paracetamol and ORS", "region": "UP West"}),
    _sc("pharma-batch-complaints", "pharma", "quality_recall", "Seal-damage complaints on one batch",
        "Seven complaints on one batch in nine days, three regions. Route-only to QA.",
        "Seven 'seal damaged' complaints arrive on one batch within nine days from three regions.",
        ctx={"lot": "batch B-2291"}),
    _sc("pharma-stockist-credit", "pharma", "payment_default", "Tier-A stockist under credit stress",
        "Overdue ratio jumps from 4% to 27% in a month.",
        "A tier-A stockist in Haryana starts missing payment dates; overdue ratio climbs to 27%.",
        ctx={"account": "the Haryana tier-A stockist"}),
    _sc("pharma-price-cap", "pharma", "regulatory_change", "NPPA price cap on 14 SKUs",
        "Ceiling price cuts MRP on 14 SKUs by about 18%.",
        "A new ceiling-price notification cuts the MRP of 14 SKUs by about 18% from next month.",
        ctx={"rule": "ceiling-price notification on 14 SKUs"}),
    # --- FMCG / consumer goods
    _sc("fmcg-assam-flood", "fmcg", "natural_disaster", "Floods cut off the Guwahati depot",
        "Depot unreachable for nine days during peak season.",
        "Brahmaputra floods cut road access to the Guwahati depot for nine days.", duration_days=9),
    _sc("fmcg-truckers-strike", "fmcg", "labour_strike", "Truckers' strike halts primary freight",
        "60% of primary freight stops for a week.",
        "A nationwide truckers' strike halts about 60% of primary freight for a week.",
        duration_days=7, ctx={"site": "primary freight", "lane": "national lanes"}),
    _sc("fmcg-detergent-war", "fmcg", "price_war", "Rival detergent cuts price 15%",
        "Modern-trade share slips as a rival undercuts.",
        "A rival detergent brand cuts its price 15% across modern trade.",
        ctx={"sku": "detergent packs", "channel": "modern trade"}),
    _sc("fmcg-heatwave-beverages", "fmcg", "demand_spike", "Heatwave beverage surge",
        "Beverage demand up 55%; stock-outs at 300 outlets.",
        "A heatwave lifts beverage demand 55% across North India; 300 outlets run dry.",
        ctx={"sku": "beverages", "region": "North India"}),
    _sc("fmcg-laminate-fire", "fmcg", "supplier_failure", "Fire at the packaging-film supplier",
        "40% of SKUs short of laminate for a month.",
        "A fire at the packaging-film supplier leaves 40% of SKUs short of laminate.",
        sev=1.1, ctx={"supplier": "the laminate supplier", "sku": "laminate-packed SKUs"}),
    _sc("fmcg-palm-diesel", "fmcg", "cost_spike", "Palm oil and diesel spike together",
        "Input and freight costs up 22% in a month.",
        "Palm oil and diesel prices rise together; input and freight costs jump 22%.",
        ctx={"input": "palm oil and diesel"}),
    _sc("fmcg-superstockist-churn", "fmcg", "account_churn", "Top super-stockist eyes a rival",
        "The Pune super-stockist, about 7% of volume, signals a switch.",
        "The largest Pune super-stockist starts shifting orders to a rival brand.", sev=0.4,
        ctx={"account": "the Pune super-stockist"}),
    # --- Manufacturing (auto components)
    _sc("mfg-kutch-quake", "manufacturing", "natural_disaster", "Earthquake hits a casting supplier",
        "Tier-2 casting supplier in Kutch offline; line-side stock for 9 days.",
        "An earthquake damages a tier-2 casting supplier in Kutch; it stops shipping.",
        ctx={"site": "the Kutch casting supplier", "alt_site": "a Rajkot foundry"}),
    _sc("mfg-chip-allocation", "manufacturing", "supplier_failure", "Chip allocation cut 35%",
        "ECU line short of microcontrollers for six weeks.",
        "The semiconductor distributor cuts our microcontroller allocation by 35%.",
        sev=1.15, ctx={"supplier": "the chip distributor", "sku": "ECU microcontrollers"}),
    _sc("mfg-oem-pull-forward", "manufacturing", "demand_spike", "OEM pulls the festive schedule forward",
        "Brake-assembly call-offs up 40% for three weeks.",
        "The largest OEM pulls its festive schedule forward: brake-assembly call-offs up 40%.",
        ctx={"region": "the OEM line"}),
    _sc("mfg-torque-escape", "manufacturing", "quality_recall", "Torque defect found at the OEM line",
        "Two lots of steering knuckles flagged. Route-only to QA.",
        "The OEM line reports a torque defect in two lots of steering knuckles.",
        ctx={"lot": "lots K-118 and K-119"}),
    _sc("mfg-steel-coil", "manufacturing", "cost_spike", "Steel coil prices up 18%",
        "Material cost jumps; fixed-price OEM contracts squeeze margin.",
        "Hot-rolled steel coil prices rise 18% in a month.",
        ctx={"input": "steel coil"}),
    _sc("mfg-manesar-strike", "manufacturing", "labour_strike", "Contract workers strike at Manesar",
        "Five-day stoppage on two assembly lines.",
        "Contract workers at the Manesar plant stop work for five days.", duration_days=5),
    _sc("mfg-ransomware", "manufacturing", "it_outage", "Ransomware locks MES and ERP",
        "No production orders or dispatch notes for 72 hours.",
        "Ransomware locks the MES and ERP; no production orders or dispatch notes for 72 hours.",
        ctx={"system": "MES / ERP"}),
    _sc("mfg-bearing-port", "manufacturing", "late_shipment", "Imported bearings three weeks late",
        "Chennai port backlog delays a bearing shipment.",
        "A Chennai port backlog delays imported bearings by three weeks.",
        ctx={"sku": "imported bearings"}),
    # --- E-commerce & retail
    _sc("ecom-sale-surge", "ecommerce", "demand_spike", "Festive sale traffic six times normal",
        "Fulfilment centres overflow; delivery promises slip.",
        "The festive sale brings six times normal orders; fulfilment centres overflow.",
        sev=1.15, ctx={"sku": "sale SKUs", "region": "metro fulfilment"}),
    _sc("ecom-fragile-breakage", "ecommerce", "transit_damage", "Fragile orders arrive broken",
        "6% of fragile orders broken on delivery by one courier.",
        "A last-mile courier changes handling; 6% of fragile orders arrive broken.",
        sev=1.1),
    _sc("ecom-hub-jam", "ecommerce", "late_shipment", "Courier hub jam in Bhiwandi",
        "Two-day promise missed on 30% of orders.",
        "A courier hub jam in Bhiwandi makes 30% of orders miss the two-day promise.",
        ctx={"sku": "two-day orders"}),
    _sc("ecom-gateway-outage", "ecommerce", "it_outage", "Payment gateway fails on sale day",
        "Checkout failures hit 40% for six hours.",
        "The primary payment gateway degrades on sale day; 40% of checkouts fail.",
        duration_days=1, ctx={"system": "Payment gateway"}),
    _sc("ecom-electronics-war", "ecommerce", "price_war", "Rival runs a 20%-off electronics week",
        "Electronics conversion drops as a rival undercuts.",
        "A rival marketplace launches a 20%-off electronics week.",
        ctx={"sku": "electronics", "channel": "the marketplace"}),
    _sc("ecom-cod-remittance", "ecommerce", "payment_default", "COD remittances held back",
        "A logistics partner delays cash-on-delivery settlements by 21 days.",
        "A logistics partner starts delaying cash-on-delivery remittances by 21 days.",
        ctx={"account": "the COD logistics partner"}),
    _sc("ecom-monsoon-bhiwandi", "ecommerce", "natural_disaster", "Monsoon floods shut a fulfilment centre",
        "Bhiwandi FC closed for four days in peak monsoon.",
        "Monsoon flooding shuts the Bhiwandi fulfilment centre for four days.", duration_days=4),
    _sc("ecom-tcs-relisting", "ecommerce", "regulatory_change", "Tax rule change forces relisting",
        "8,000 SKUs need new tax codes before the deadline.",
        "A tax-collection rule change forces 8,000 SKUs to be relisted with new codes.",
        ctx={"rule": "tax-collection rule change for marketplace sellers"}),
    # --- Logistics / 3PL
    _sc("log-red-sea", "logistics", "late_shipment", "Red Sea diversion adds 14 days",
        "Europe-lane transit time jumps; client stock runs short.",
        "Carriers divert Europe-lane vessels around the Cape; transit time rises 14 days.",
        sev=1.1, ctx={"sku": "client import cargo"}),
    _sc("log-odisha-cyclone", "logistics", "natural_disaster", "Cyclone shuts Paradip port and NH-16",
        "Port and highway closed for six days.",
        "A cyclone shuts Paradip port and NH-16 for six days.",
        duration_days=6, ctx={"site": "the Paradip corridor", "alt_site": "Visakhapatnam port", "region": "Odisha"}),
    _sc("log-diesel-surge", "logistics", "cost_spike", "Diesel up 12% overnight",
        "Most contracts lack a fuel-surcharge clause.",
        "Diesel prices rise 12% overnight; most client contracts lack a fuel-surcharge clause.",
        sev=1.1, ctx={"input": "diesel"}),
    _sc("log-driver-strike", "logistics", "labour_strike", "Driver strike at the Chennai hub",
        "Outbound trips down 55% for four days.",
        "Drivers at the Chennai hub strike over trip allowances for four days.", duration_days=4),
    _sc("log-client-tender", "logistics", "account_churn", "Largest client tenders 40% of volume",
        "E-commerce client moves part of its volume to a rival 3PL.",
        "The largest e-commerce client puts 40% of its volume out to tender.", sev=0.9),
    _sc("log-tms-outage", "logistics", "it_outage", "TMS cloud outage",
        "No tracking or e-way bills for 36 hours.",
        "The TMS cloud provider fails; no tracking or e-way bills for 36 hours.",
        duration_days=1.5, ctx={"system": "TMS"}),
    _sc("log-crossdock-damage", "logistics", "transit_damage", "Forklift damage at a cross-dock",
        "Claims triple at the Nagpur cross-dock.",
        "New forklift operators at the Nagpur cross-dock triple damage claims.",
        ctx={"lane": "the Nagpur cross-dock", "partner": "the cross-dock contractor"}),
    _sc("log-client-insolvency", "logistics", "payment_default", "Client enters insolvency talks",
        "120-day receivables from an FMCG client at risk.",
        "An FMCG client enters insolvency talks with 120-day receivables outstanding.",
        sev=1.15, ctx={"account": "the FMCG client"}),
    # --- Food & cold chain
    _sc("food-reefer-breakdown", "food", "transit_damage", "Reefer breakdown on the highway",
        "18 tonnes of dairy out of temperature range.",
        "A reefer breaks down on the Pune-Hyderabad lane; 18 tonnes of dairy go out of range.",
        sev=1.15),
    _sc("food-heat-power", "food", "natural_disaster", "Heatwave and grid failure at a cold store",
        "Cold store without power for 14 hours.",
        "A heatwave trips the grid; the Nagpur cold store runs 14 hours on failing backup.",
        duration_days=2),
    _sc("food-rte-contamination", "food", "quality_recall", "Lab flags one lot of ready-to-eat salads",
        "Positive pathogen test on one lot. Route-only to QA.",
        "A routine lab test flags one lot of ready-to-eat salads; QA must decide.",
        ctx={"lot": "lot S-0412"}),
    _sc("food-milk-procurement", "food", "supplier_failure", "Cattle disease cuts milk procurement",
        "Procurement down 25% across two districts.",
        "A cattle disease outbreak cuts milk procurement 25% across two districts.",
        ctx={"supplier": "village collection centres", "sku": "milk"}),
    _sc("food-label-deadline", "food", "regulatory_change", "Labelling deadline moved up",
        "Front-of-pack labels due three months early.",
        "The food regulator moves the front-of-pack labelling deadline up by three months.",
        ctx={"rule": "front-of-pack labelling deadline moved up"}),
    _sc("food-qsr-tender", "food", "account_churn", "QSR chain puts supply out to tender",
        "An account worth 18% of revenue may leave.",
        "A QSR chain worth 18% of revenue puts its dairy supply out to tender.", sev=1.0),
    _sc("food-festive-sweets", "food", "demand_spike", "Festive sweets and dairy surge",
        "Diwali demand for sweets and dairy up 60%.",
        "Diwali demand for sweets and dairy rises 60% in two weeks.",
        ctx={"sku": "sweets and dairy", "region": "Central India"}),
]
SC = {s["id"]: s for s in SCENARIOS}

_CTX_DEFAULT = {"site": "the main site", "alt_site": "the alternate site", "region": "the affected region",
                "account": "the key account", "sku": "the affected SKU", "partner": "the partner", "lane": "the main lane",
                "supplier": "the supplier", "lot": "the affected lot", "system": "The core system", "rule": "the new rule",
                "input": "the input", "channel": "the main channel"}


class _Ctx(dict):
    def __missing__(self, key: str) -> str:
        return _CTX_DEFAULT.get(key, key)


def _ctx(sc: dict[str, Any]) -> _Ctx:
    return _Ctx({**IND[sc["industry"]]["ctx"], **sc["ctx"]})


def _f(text: str, ctx: _Ctx) -> str:
    out = text.format_map(ctx)
    return out[:1].upper() + out[1:]


def _params(sc: dict[str, Any]) -> dict[str, Any]:
    p = {**CAT[sc["category"]]["profile"], **sc["overrides"]}
    p.setdefault("regulatory", False)
    p.setdefault("sev", 1.0)
    return p


def _level_mode(level: int, regulatory: bool) -> str:
    if regulatory or level > POLICY["provisional_max_level"]:
        return "human_only"
    if level <= POLICY["auto_decide_max_level"]:
        return "auto"
    return "provisional"


def _playbook(sc: dict[str, Any], p: dict[str, Any]) -> list[dict[str, Any]]:
    c = _ctx(sc)
    return [{"step": i + 1, "owner_role": r, "owner_label": _role_label(r), "action": _f(a, c), "scope": s}
            for i, (r, a, s) in enumerate(p["playbook"])]


def _catalog_entry(sc: dict[str, Any]) -> dict[str, Any]:
    p = _params(sc)
    return {"id": sc["id"], "industry": sc["industry"], "category": sc["category"], "title": sc["title"],
            "one_liner": sc["one_liner"], "trigger": sc["trigger"], "horizon_weeks": int(p["horizon"]),
            "start_level": int(p["start_level"]), "peak_level": int(p["peak_level"]), "primary_kpi": p["primary"],
            "regulatory": bool(p["regulatory"])}


# ---------------------------------------------------------------------------------------------------- model
def _raw(x: float, p: dict[str, Any]) -> float:
    """Unmitigated impact x days after onset."""
    if x <= 0:
        return 0.0
    ramp = max(float(p["ramp_days"]), 0.01)
    grow = 1.0 + float(p["spread"]) * max(0.0, x - ramp) / 7.0
    return min(1.6, min(1.0, x / ramp) * grow)


def _impact(day: float, onset: float, pivot: float, tau_days: float, residual: float, p: dict[str, Any]) -> float:
    if day <= onset:
        return 0.0
    if day <= pivot:
        return _raw(day - onset, p)
    peak = _raw(pivot - onset, p)
    floor = residual * peak
    return floor + (peak - floor) * math.exp(-(day - pivot) / tau_days)


Decision = Literal["approve", "wait", "escalate"]
DECISIONS: tuple[str, ...] = ("approve", "wait", "escalate")


def _timeline(p: dict[str, Any]) -> dict[str, float]:
    onset = float(p["onset_day"])
    detect = onset + float(p["lag_with"])
    n_alerts = max(0, int(p["peak_level"]) - int(p["start_level"]))
    t_alerts = [detect + 0.1 * (k + 1) for k in range(n_alerts)]
    t_inv = detect + 0.1 * n_alerts + 0.15
    t_mem = t_inv + 0.06
    t_plan = t_mem + 0.06
    return {"onset": onset, "detect": detect, "alerts": t_alerts, "investigate": t_inv, "remember": t_mem,  # type: ignore[dict-item]
            "plan": t_plan, "gate": t_plan + 0.02}


def _branch(p: dict[str, Any], decision: str, gate: float) -> dict[str, Any]:
    """How the human-gate choice changes the with-STRATA response (pre-declared, deterministic)."""
    level = int(p["peak_level"])
    mode = _level_mode(level, bool(p["regulatory"]))
    deadline_d = POLICY["deadlines_hours"][str(level)] / 24.0
    if decision == "approve":
        delay, tau_mult, extra_cost = 0.25, 1.0, 0.0
    elif decision == "wait":
        if mode == "human_only":
            delay, tau_mult, extra_cost = deadline_d + 0.5, 1.0, 0.0
        else:
            delay, tau_mult, extra_cost = deadline_d, 1.12, 0.0
    elif decision == "escalate":
        delay, tau_mult, extra_cost = 0.5, 0.85, 0.06
    else:
        raise ValueError(decision)
    return {"decision": decision, "mode": mode, "level": level, "deadline_days": deadline_d, "decided_at": gate + delay,
            "mitigation": gate + delay + float(p["exec_lag"]), "tau_mult": tau_mult, "extra_cost": extra_cost}


def _kpi_value(kpi: str, base: float, shock: float, imp: float, extra_cost: float = 0.0, extra_w: float = 0.0) -> float:
    if KPI[kpi]["good"] == "up":
        v = base * (1.0 - shock * imp)
    else:
        v = base * (1.0 + shock * imp)
    if kpi == "cost_to_serve" and extra_cost:
        v += base * extra_cost * extra_w
    if kpi == "service_level":
        v = min(v, 100.0)
    return max(v, 0.0)


def _core(sc: dict[str, Any], horizon: int, decision: str) -> dict[str, Any]:
    """Noise-free trajectories as functions of day, plus the derived summary numbers."""
    p = _params(sc)
    tl = _timeline(p)
    onset = tl["onset"]
    br = _branch(p, decision, tl["gate"])
    end = onset + float(p["duration_days"]) if p.get("duration_days") else math.inf
    det_wo = onset + float(p["lag_without"])
    m_wo = det_wo + float(p["respond_without"])
    piv_w, piv_wo = min(br["mitigation"], end), min(m_wo, end)
    tau_w = float(p["tau_with_w"]) * 7.0 * br["tau_mult"]
    tau_wo = float(p["tau_without_w"]) * 7.0
    sev = float(p["sev"])
    shocks = {k: float(p["shocks"].get(k, 0.0)) * sev for k in KPI}
    base = IND[sc["industry"]]["base"]
    H = horizon * 7.0

    def imp_with(d: float) -> float:
        return _impact(d, onset, piv_w, tau_w, float(p["residual_with"]), p)

    def imp_without(d: float) -> float:
        return _impact(d, onset, piv_wo, tau_wo, float(p["residual_without"]), p)

    def extra_w(d: float) -> float:
        return math.exp(-(d - br["mitigation"]) / tau_w) if d >= br["mitigation"] else 0.0

    def val(traj: str, kpi: str, d: float) -> float:
        if traj == "baseline":
            return float(base[kpi])
        if traj == "with_strata":
            return _kpi_value(kpi, base[kpi], shocks[kpi], imp_with(d), br["extra_cost"], extra_w(d))
        return _kpi_value(kpi, base[kpi], shocks[kpi], imp_without(d))

    def recovered(fn: Any, pivot: float) -> float | None:
        d = max(pivot, onset + 0.5)
        while d <= H:
            if fn(d) <= RECOVERED_AT:
                return d
            d += 0.25
        return None

    rec_w, rec_wo = recovered(imp_with, piv_w), recovered(imp_without, piv_wo)
    prim = p["primary"]

    def peak_pct(traj: str) -> float:
        worst = 0.0
        d = 0.0
        while d <= H:
            dev = (val(traj, prim, d) - base[prim]) / base[prim]
            if abs(dev) > abs(worst):
                worst = dev
            d += 0.25
        return round(worst * 100, 1)

    def integral(kpi: str) -> float:
        tot, d = 0.0, 0.0
        while d < H:
            tot += (val("with_strata", kpi, d + 0.125) - val("without_strata", kpi, d + 0.125)) * 0.25 / 7.0
            d += 0.25
        return tot

    return {"p": p, "tl": tl, "branch": br, "onset": onset, "det_wo": det_wo, "m_wo": m_wo, "piv_w": piv_w, "piv_wo": piv_wo,
            "imp_with": imp_with, "imp_without": imp_without, "val": val, "rec_w": rec_w, "rec_wo": rec_wo,
            "peak_with": peak_pct("with_strata"), "peak_without": peak_pct("without_strata"),
            "exposure_protected": round(integral("revenue"), 1), "complaints_avoided": round(-integral("complaints"), 0),
            "H": H}


def _weeks_from(day: float | None, onset: float) -> float | None:
    return None if day is None else round((day - onset) / 7.0, 1)


def _branch_summary(sc: dict[str, Any], horizon: int, decision: str) -> dict[str, Any]:
    c = _core(sc, horizon, decision)
    return {"decision": decision, "mode": c["branch"]["mode"], "decided_day": round(c["branch"]["decided_at"], 2),
            "action_day": round(c["branch"]["mitigation"], 2), "weeks_to_recover": _weeks_from(c["rec_w"], c["onset"]),
            "peak_impact_pct": c["peak_with"], "exposure_protected": c["exposure_protected"],
            "extra_cost_pct": round(c["branch"]["extra_cost"] * 100, 1), "provenance": PROVENANCE}


def _hours(days: float) -> str:
    h = days * 24
    return f"{round(h)} h" if h < 48 else f"{round(days, 1)} days"


def _gate_options(p: dict[str, Any], gate: float) -> list[dict[str, Any]]:
    out = []
    for d in DECISIONS:
        b = _branch(p, d, gate)
        if d == "approve":
            label, effect = "Approve plan", f"Decided within about 6 h; work on the ground starts in about {_hours(b['mitigation'] - gate)}."
        elif d == "wait":
            label = "Let the agent decide at deadline"
            effect = (f"Level {b['level']} is human-only: at the {_hours(b['deadline_days'])} deadline it escalates to the Business Head."
                      if b["mode"] == "human_only" else
                      f"At the {_hours(b['deadline_days'])} deadline the agent takes a provisional decision: internal, reversible steps only.")
        else:
            label, effect = "Escalate", "Business Head reviews within 12 h and adds capacity: faster recovery, higher cost."
        out.append({"key": d, "label": label, "effect": effect})
    return out


def _events(sc: dict[str, Any], c: dict[str, Any]) -> list[dict[str, Any]]:
    p, tl, br = c["p"], c["tl"], c["branch"]
    ctx = _ctx(sc)
    ind = IND[sc["industry"]]
    H = c["H"]
    owner = p["owner"]
    level = int(p["start_level"])
    peak = int(p["peak_level"])
    sig = [_f(s, ctx) for s in p["signals"]]
    causes = [_f(x, ctx) for x in p["causes"]]
    ev: list[dict[str, Any]] = []

    def add(day: float, stage: str, title: str, detail: str, actor: str, risk: int | None, kind: str,
            track: str = "with", **extra: Any) -> None:
        if day > H:
            return
        ev.append({"day": round(day, 2), "week": int(day // 7) + 1, "stage": stage, "title": title, "detail": detail,
                   "actor": actor, "risk_level": risk, "kind": kind, "track": track, **extra})

    add(0.0, "observe", "Normal operations",
        f"{len(ind['sources'])} feeds watched: {', '.join(ind['sources'])}.", "agent", None, "signal", "both")
    add(tl["onset"], "observe", "Trigger", sc["trigger"], "external", None, "trigger", "both")
    add(tl["detect"], "detect", f"Sentinel flags: {sig[0]}",
        f"Risk level {level} ({LEVEL_LABEL[level]}) opened. Detected {_hours(tl['detect'] - tl['onset'])} after onset.",
        "agent", level, "alert", level_change=[None, level])
    emailed = False
    if level >= POLICY["email_min_level"]:
        roles = ", ".join(_role_label(r) for r in p["notify"])
        add(tl["detect"] + 0.02, "detect", f"E-mail alert to {roles}",
            f"Level {level} alert (simulated e-mail; nothing leaves the machine).", "system", level, "notify",
            roles=p["notify"])
        emailed = True
    for k, t in enumerate(tl["alerts"]):
        new = min(5, level + 1)
        add(t, "detect", f"Corroborating alert: {sig[(k + 1) % len(sig)]}",
            f"{k + 2} independent sources agree. Risk level {level} → {new} ({LEVEL_LABEL[new]}).", "agent", new, "alert",
            level_change=[level, new])
        level = new
        if level >= POLICY["email_min_level"] and not emailed:
            roles = ", ".join(_role_label(r) for r in p["notify"])
            add(t + 0.02, "detect", f"E-mail alert to {roles}",
                f"Level {level} alert (simulated e-mail; nothing leaves the machine).", "system", level, "notify",
                roles=p["notify"])
            emailed = True
        if level == 5:
            add(t + 0.03, "detect", "Business Head paged", "Level 5 (Critical): the top of the hierarchy is told at once (simulated).",
                "system", level, "notify", roles=["business_head"])
    add(tl["investigate"], "investigate", "Investigator ranks the causes",
        f"Most likely: {causes[0]}. Tested and ranked lower: {causes[1]}; {causes[2]}.", "agent", level, "analysis")
    add(tl["remember"], "remember", "Memory recalls a similar case", p["memory"], "agent", level, "memory")
    req_role = "qa_head" if p["regulatory"] else ("business_head" if level == 5 else owner)
    n_steps = len(p["playbook"])
    add(tl["plan"], "act", f"Plan drafted: {n_steps} steps",
        f"Owner: {_role_label(owner)}. " + ("Route-only: QA decides; STRATA gives no clinical or safety advice."
                                           if p["regulatory"] else "Internal steps and customer drafts ready for review."),
        "agent", level, "plan")
    gate = {"id": "gate-1", "required_role": req_role, "required_role_label": _role_label(req_role),
            "deadline_hours": POLICY["deadlines_hours"][str(level)], "level": level, "mode": br["mode"],
            "options": _gate_options(p, tl["gate"]), "chosen": br["decision"]}
    mode_txt = {"auto": "agent decides at deadline", "provisional": "provisional agent decision at deadline",
                "human_only": "human-only: escalates at deadline"}[br["mode"]]
    add(tl["gate"], "act", f"Human gate: {gate['required_role_label']} decision needed",
        f"Level {level} ({LEVEL_LABEL[level]}). Policy: {mode_txt}. Deadline {gate['deadline_hours']} h.", "agent", level,
        "gate", decision=gate, id="gate")

    # --- branch-specific (after the gate)
    g = tl["gate"]
    dec = br["decision"]
    if dec == "approve":
        add(br["decided_at"], "act", f"Plan approved by {_role_label(req_role)}",
            "Approved inside the deadline. Tasks created (simulated).", "human", level, "approval", role=req_role, branch=dec)
    elif dec == "wait" and br["mode"] != "human_only":
        add(br["decided_at"], "act", "Deadline reached: agent takes a provisional decision",
            "Only internal, reversible steps start now; external messages wait for a human.", "agent", level,
            "auto_decision", branch=dec)
        add(br["decided_at"] + 0.5, "act", f"{_role_label(req_role)} confirms the provisional plan",
            "External steps released.", "human", level, "approval", role=req_role, branch=dec)
    elif dec == "wait":
        add(g + br["deadline_days"], "act", "Deadline reached: escalated to the Business Head",
            f"Level {level} is human-only, so the agent does not act on its own.", "system", level, "escalation", branch=dec,
            roles=["business_head"])
        add(br["decided_at"], "act", "Business Head approves the plan", "Approved after escalation.", "human", level,
            "approval", role="business_head", branch=dec)
    else:
        add(g + 0.02, "act", "Escalated to the Business Head", "Asked for extra capacity and budget.", "human", level,
            "escalation", role=req_role, branch=dec, roles=["business_head"])
        add(br["decided_at"], "act", "Business Head approves with extra capacity",
            "Faster recovery expected; cost to serve rises while it runs.", "human", level, "approval", role="business_head",
            branch=dec)
    m = br["mitigation"]
    for i, step in enumerate(_playbook(sc, p)):
        detail = f"{step['owner_label']} · {step['scope']}"
        if step["scope"] == "external":
            detail += " · message drafted for review (simulated, nothing sent)"
        add(m + 0.35 * i, "act", step["action"], detail, "human", level, "action", role=step["owner_role"], branch=dec,
            scope=step["scope"])
    if p.get("auto_side"):
        add(m + 0.2, "act", "Side alert auto-decided (level 1)",
            f"{_f(p['auto_side'], ctx)}. Level 1 is inside the agent's own authority under the policy.", "agent", level,
            "auto_decision", branch=dec, side_level=1)
    # risk steps down as the with-STRATA impact recedes
    imp_peak = c["imp_with"](c["piv_w"])
    cur = level
    d = c["piv_w"]
    for k in range(1, peak):
        thr = imp_peak * (1 - k / peak)
        while d <= H and c["imp_with"](d) > thr:
            d += 0.25
        if d > H:
            break
        new = max(1, cur - 1)
        prim = p["primary"]
        v = c["val"]("with_strata", prim, d)
        add(d, "act", f"Risk level {cur} → {new}",
            f"{KPI[prim]['label']} at {v:.1f} {KPI[prim]['unit']} and improving.", "agent", new, "level", branch=dec,
            level_change=[cur, new])
        cur = new
    rec = c["rec_w"]
    t_learn = rec if rec is not None else H - 1.0
    wk = _weeks_from(rec, c["onset"])
    add(t_learn, "learn", "Outcome recorded (illustrative)",
        f"Back within the normal band after {wk} weeks." if rec is not None else "Still recovering at the end of the horizon.",
        "agent", 1 if rec is not None else cur, "outcome", branch=dec)
    add(t_learn + 0.3, "learn", "Memory updated",
        "Playbook, decision and outcome written to memory; the next similar case will match it.", "agent",
        1 if rec is not None else cur, "learn", branch=dec)
    add(t_learn + 0.6, "learn", "Detector note",
        f"First useful signal was \"{sig[0]}\". It stays on the watch list for similar cases.", "agent",
        1 if rec is not None else cur, "learn", branch=dec)

    # --- the without-STRATA track (for contrast)
    add(c["det_wo"], "detect", "Without STRATA: first noticed", p["without_source"], "human", None, "contrast", "without")
    add(c["m_wo"], "act", "Without STRATA: manual response starts",
        f"{p['respond_without']} days of calls and e-mail threads after noticing.", "human", None, "contrast", "without")
    if c["rec_wo"] is not None:
        add(c["rec_wo"], "learn", "Without STRATA: recovered",
            f"Back within the normal band after {_weeks_from(c['rec_wo'], c['onset'])} weeks; no memory written.",
            "human", None, "contrast", "without")
    else:
        add(H - 0.5, "learn", "Without STRATA: still below normal",
            "Not back within the normal band by the end of the horizon.", "human", None, "contrast", "without")

    ev.sort(key=lambda e: (e["day"], 0 if e["track"] != "without" else 1))
    for i, e in enumerate(ev):
        e.setdefault("id", f"e{i:02d}")
    return ev


def _series(sc: dict[str, Any], c: dict[str, Any], horizon: int, seed: int) -> tuple[list[float], dict[str, Any]]:
    days = [float(d) for d in range(0, min(21, horizon * 7) + 1)]
    w = 3
    while (w + 0.5) * 7 < horizon * 7:
        days.append((w + 0.5) * 7)
        w += 1
    days.append(horizon * 7.0)
    rng = random.Random(f"{sc['id']}|{seed}")
    noise = {k["key"]: [rng.gauss(0.0, k["noise"]) for _ in days] for k in KPIS}  # shared by all trajectories
    out: dict[str, Any] = {}
    for traj in ("baseline", "without_strata", "with_strata"):
        out[traj] = {}
        for k in KPIS:
            pts = []
            for i, d in enumerate(days):
                v = c["val"](traj, k["key"], d) * (1.0 + noise[k["key"]][i])
                if k["key"] == "service_level":
                    v = min(v, 100.0)
                pts.append([round(d / 7.0, 3), round(v, 2)])
            out[traj][k["key"]] = pts
    return days, out


class RunIn(BaseModel):
    scenario_id: str
    horizon_weeks: int | None = Field(default=None, ge=8, le=52)
    seed: int | None = None
    decision: Decision = "approve"


def run(scenario_id: str, horizon_weeks: int | None = None, seed: int | None = None,
        decision: str = "approve") -> dict[str, Any]:
    sc = SC.get(scenario_id)
    if sc is None:
        raise KeyError(scenario_id)
    if decision not in DECISIONS:
        raise ValueError(decision)
    p = _params(sc)
    horizon = int(horizon_weeks or p["horizon"])
    seed = DEFAULT_SEED if seed is None else int(seed)
    c = _core(sc, horizon, decision)
    events = _events(sc, c)
    _, series = _series(sc, c, horizon, seed)
    prim = p["primary"]
    onset = c["onset"]
    gate_ev = next(e for e in events if e.get("kind") == "gate")
    kpis = [
        {"key": "days_to_detect", "label": "Days to detect", "unit": "days", "better": "lower",
         "with": round(c["tl"]["detect"] - onset, 2), "without": round(c["det_wo"] - onset, 2)},
        {"key": "peak_impact", "label": f"Peak change in {KPI[prim]['label'].lower()}", "unit": "%", "better": "smaller",
         "with": c["peak_with"], "without": c["peak_without"]},
        {"key": "weeks_to_recover", "label": "Weeks to recover", "unit": "weeks", "better": "lower",
         "with": _weeks_from(c["rec_w"], onset), "without": _weeks_from(c["rec_wo"], onset)},
        {"key": "exposure_protected", "label": "Order value protected", "unit": "₹ lakh", "better": "higher",
         "value": c["exposure_protected"]},
        {"key": "complaints_avoided", "label": "Complaints avoided", "unit": "complaints", "better": "higher",
         "value": c["complaints_avoided"]},
    ]
    for k in kpis:
        k["provenance"] = PROVENANCE
        k["caption"] = CAPTION
    rw, rwo = kpis[2]["with"], kpis[2]["without"]
    rec_txt = (f"recovery in {rw} weeks instead of {rwo}" if rw is not None and rwo is not None else
               f"recovery in {rw} weeks while the late response is still below normal at week {horizon}" if rw is not None else
               f"neither path fully recovers within {horizon} weeks")
    summary = (f"With STRATA the issue is flagged after {_hours(c['tl']['detect'] - onset)} instead of "
               f"{_hours(c['det_wo'] - onset)}; peak change in {KPI[prim]['label'].lower()} is {c['peak_with']}% "
               f"instead of {c['peak_without']}%; {rec_txt}. {CAPTION}")
    entry = _catalog_entry(sc)
    ind, cat = IND[sc["industry"]], CAT[sc["category"]]
    return {
        "scenario": {**entry, "industry_label": ind["label"], "category_label": cat["label"],
                     "context": dict(_ctx(sc)), "playbook": _playbook(sc, p), "owner_role": p["owner"],
                     "owner_label": _role_label(p["owner"])},
        "horizon_weeks": horizon, "seed": seed, "decision": decision,
        "weeks": [{"week": w + 1, "label": f"W{w + 1}", "start_day": w * 7} for w in range(horizon)],
        "kpi_meta": [{k: v for k, v in m.items() if k != "noise"} | {"base": IND[sc["industry"]]["base"][m["key"]]} for m in KPIS],
        "primary_kpi": prim,
        "series": series,
        "events": events,
        "gate": {**gate_ev["decision"], "day": gate_ev["day"], "event_id": gate_ev["id"]},
        "timeline": {"onset_day": onset, "detect_day_with": round(c["tl"]["detect"], 2),
                     "detect_day_without": round(c["det_wo"], 2), "action_day_with": round(c["branch"]["mitigation"], 2),
                     "action_day_without": round(c["m_wo"], 2),
                     "recovered_day_with": None if c["rec_w"] is None else round(c["rec_w"], 2),
                     "recovered_day_without": None if c["rec_wo"] is None else round(c["rec_wo"], 2),
                     "total_days": horizon * 7},
        "kpis": kpis,
        "branches": {d: _branch_summary(sc, horizon, d) for d in DECISIONS},
        "policy": POLICY,
        "summary": summary,
        "caption": CAPTION,
        "provenance": PROVENANCE,
    }


# ---------------------------------------------------------------------------------------------------- routes
@router.get("/catalog")
def catalog() -> dict[str, Any]:
    return {
        "industries": [{"key": i["key"], "label": i["label"], "blurb": i["blurb"],
                        "count": sum(1 for s in SCENARIOS if s["industry"] == i["key"])} for i in INDUSTRIES],
        "categories": [{"key": c["key"], "label": c["label"],
                        "count": sum(1 for s in SCENARIOS if s["category"] == c["key"])} for c in CATEGORIES],
        "stages": STAGES,
        "scenarios": [_catalog_entry(s) for s in SCENARIOS],
        "policy": POLICY,
        "caption": CAPTION,
        "provenance": PROVENANCE,
    }


@router.get("/scenarios/{scenario_id}")
def scenario_detail(scenario_id: str) -> dict[str, Any]:
    sc = SC.get(scenario_id)
    if sc is None:
        raise HTTPException(404, f"Unknown scenario {scenario_id}")
    p = _params(sc)
    return {**_catalog_entry(sc), "industry_label": IND[sc["industry"]]["label"], "category_label": CAT[sc["category"]]["label"],
            "parameters": {k: v for k, v in p.items() if k not in ("playbook", "signals", "causes", "memory", "without_source", "auto_side")},
            "playbook": _playbook(sc, p), "policy": POLICY, "caption": CAPTION, "provenance": PROVENANCE}


@router.post("/run")
def run_route(body: RunIn) -> dict[str, Any]:
    if body.scenario_id not in SC:
        raise HTTPException(404, f"Unknown scenario {body.scenario_id}")
    return run(body.scenario_id, body.horizon_weeks, body.seed, body.decision)


@router.get("/compare")
def compare(category: str) -> dict[str, Any]:
    if category not in CAT:
        raise HTTPException(404, f"Unknown category {category}")
    rows = []
    for s in SCENARIOS:
        if s["category"] != category:
            continue
        p = _params(s)
        c = _core(s, int(p["horizon"]), "approve")
        rows.append({"scenario_id": s["id"], "industry": s["industry"], "industry_label": IND[s["industry"]]["label"],
                     "title": s["title"], "horizon_weeks": int(p["horizon"]), "primary_kpi": p["primary"],
                     "detect_days_with": round(c["tl"]["detect"] - c["onset"], 2),
                     "detect_days_without": round(c["det_wo"] - c["onset"], 2),
                     "weeks_to_recover_with": _weeks_from(c["rec_w"], c["onset"]),
                     "weeks_to_recover_without": _weeks_from(c["rec_wo"], c["onset"]),
                     "peak_impact_with": c["peak_with"], "peak_impact_without": c["peak_without"],
                     "exposure_protected": c["exposure_protected"]})
    return {"category": category, "category_label": CAT[category]["label"], "rows": rows, "caption": CAPTION,
            "provenance": PROVENANCE}
