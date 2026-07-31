/* Name pools for generated people and organisations. Indian-market
   appropriate, matching Fidato's actual customer base. */

export const FIRST_NAMES = [
  "Aarav", "Aditi", "Advait", "Ananya", "Arjun", "Ishaan", "Kavya", "Meera",
  "Neha", "Nikhil", "Pooja", "Rahul", "Riya", "Rohan", "Sanya", "Shreya",
  "Siddharth", "Tanvi", "Varun", "Vikram", "Ayesha", "Farhan", "Zoya", "Imran",
  "Kabir", "Priya", "Manav", "Devika", "Yash", "Anjali", "Karthik", "Divya",
  "Sameer", "Ritika", "Aniket", "Swara", "Harsh", "Nandini", "Vivek", "Sneha",
  "Gaurav", "Lakshmi", "Rajat", "Trisha", "Abhishek", "Pallavi", "Nitin", "Ira",
] as const;

export const LAST_NAMES = [
  "Sharma", "Verma", "Patel", "Reddy", "Nair", "Iyer", "Mehta", "Joshi",
  "Kulkarni", "Desai", "Chopra", "Malhotra", "Kapoor", "Bose", "Banerjee",
  "Chatterjee", "Rao", "Gupta", "Agarwal", "Singh", "Khan", "Sheikh", "Pillai",
  "Menon", "Deshmukh", "Jadhav", "Shetty", "Bhat", "Naik", "Thakur", "Mishra",
  "Pandey", "Trivedi", "Sinha", "Ghosh", "Dutta", "Saxena", "Bhatia", "Ahuja",
] as const;

export const COMPANY_PREFIXES = [
  "Aster", "Bluewave", "Cerulean", "Dynamo", "Everest", "Fortis", "Granite",
  "Helios", "Indus", "Juniper", "Keystone", "Lumen", "Meridian", "Northwind",
  "Orbit", "Pinnacle", "Quantum", "Redwood", "Summit", "Trident", "Vertex",
  "Westbridge", "Zenith", "Arcadia", "Cobalt", "Sterling", "Vantage", "Nimbus",
] as const;

export const COMPANY_SUFFIXES = [
  "Technologies", "Industries", "Consulting", "Logistics", "Pharma", "Textiles",
  "Infrastructure", "Systems", "Solutions", "Enterprises", "Motors", "Chemicals",
  "Foods", "Financial Services", "Engineering", "Healthcare", "Media", "Retail",
] as const;

export const LEGAL_SUFFIXES = [
  "Pvt Ltd", "Limited", "LLP", "India Pvt Ltd",
] as const;

export const INDUSTRIES = [
  "Information Technology", "Pharmaceuticals", "Manufacturing", "Automotive",
  "Banking & Finance", "Logistics & Supply Chain", "Textiles", "FMCG",
  "Healthcare", "Real Estate", "Education", "Engineering & Construction",
  "Media & Entertainment", "Chemicals", "Retail", "Travel & Tourism",
] as const;

export const DESIGNATIONS = [
  "Procurement Manager", "Travel Desk Head", "HR Manager", "Admin Head",
  "Executive Assistant", "Operations Manager", "Regional Director",
  "Events Manager", "Finance Controller", "General Manager", "Founder",
  "Sales Director", "Programme Manager", "Facilities Manager",
] as const;

export const GUEST_PREFERENCES = [
  "High floor", "Non-smoking", "Late check-out", "Early check-in",
  "Twin beds", "King bed", "Airport pickup", "Vegetarian meals",
  "Jain meals", "Quiet room", "Away from lift", "Extra pillows",
  "Room with a view", "Ground floor", "Connecting rooms",
] as const;

export const SPECIAL_REQUESTS = [
  "Guest arriving on a late flight, please hold the room.",
  "Please arrange an airport pickup for the primary guest.",
  "Anniversary stay — cake and room decoration requested.",
  "Corporate booking, invoice must be raised to the company.",
  "Requires an accessible room on the ground floor.",
  "Group travelling together, rooms on the same floor please.",
  "Early breakfast required, guests depart at 06:00.",
  "Vegetarian meals only for the entire group.",
  "Please arrange a projector and screen in the meeting room.",
  "",
  "",
  "",
] as const;

export const CANCELLATION_REASONS = [
  "Guest cancelled the trip",
  "Corporate travel plan changed",
  "Duplicate booking raised in error",
  "Event postponed by the client",
  "Rate not approved by the client's finance team",
  "Guest found alternate accommodation",
  "Flight cancelled",
] as const;

export const INTERNAL_NOTES = [
  "Repeat corporate account — keep the negotiated rate.",
  "Client is rate-sensitive, avoid upselling.",
  "Long-standing relationship, prioritise room allocation.",
  "First booking from this account, ensure smooth handover.",
  "Payment historically delayed, follow up before arrival.",
  "VIP guest, notify the general manager on arrival.",
  "",
  "",
] as const;

export const AVATAR_COLORS = [
  "#df6128", "#eb8c00", "#1f6f5c", "#2b6cb0", "#db536a",
  "#354552", "#67737e", "#a34314",
] as const;
