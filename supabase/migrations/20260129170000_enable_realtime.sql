-- Enable realtime for bidding tables
ALTER PUBLICATION supabase_realtime ADD TABLE bids;
ALTER PUBLICATION supabase_realtime ADD TABLE lots;
ALTER PUBLICATION supabase_realtime ADD TABLE auctions;
