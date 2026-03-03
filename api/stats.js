// api/stats.js
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { count, error } = await supabase
      .from("signups")
      .select("*", { count: "exact", head: true })
      .eq("verification_status", "waitlist");

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ waitlistCount: count ?? 0 });
  } catch (e) {
    return res.status(500).json({ error: "Server error" });
  }
}
