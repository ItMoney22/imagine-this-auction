export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          role: 'bidder' | 'auctioneer' | 'admin'
          first_name: string | null
          last_name: string | null
          phone: string | null
          is_approved: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          role?: 'bidder' | 'auctioneer' | 'admin'
          first_name?: string | null
          last_name?: string | null
          phone?: string | null
          is_approved?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          role?: 'bidder' | 'auctioneer' | 'admin'
          first_name?: string | null
          last_name?: string | null
          phone?: string | null
          is_approved?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      auctioneers: {
        Row: {
          id: string
          user_id: string
          company_name: string
          business_license: string | null
          tax_id: string | null
          address_line1: string
          address_line2: string | null
          city: string
          state: string
          zip_code: string
          website: string | null
          logo_url: string | null
          is_approved: boolean
          approval_date: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          company_name: string
          business_license?: string | null
          tax_id?: string | null
          address_line1: string
          address_line2?: string | null
          city: string
          state: string
          zip_code: string
          website?: string | null
          logo_url?: string | null
          is_approved?: boolean
          approval_date?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          company_name?: string
          business_license?: string | null
          tax_id?: string | null
          address_line1?: string
          address_line2?: string | null
          city?: string
          state?: string
          zip_code?: string
          website?: string | null
          logo_url?: string | null
          is_approved?: boolean
          approval_date?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      auctions: {
        Row: {
          id: string
          auctioneer_id: string
          title: string
          description: string | null
          starts_at: string
          ends_at: string
          status: 'draft' | 'scheduled' | 'live' | 'ended' | 'completed'
          buyer_premium_percent: number
          anti_sniping_seconds: number
          terms_and_conditions: string | null
          preview_start: string | null
          preview_end: string | null
          pickup_start: string | null
          pickup_end: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          auctioneer_id: string
          title: string
          description?: string | null
          starts_at: string
          ends_at: string
          status?: 'draft' | 'scheduled' | 'live' | 'ended' | 'completed'
          buyer_premium_percent?: number
          anti_sniping_seconds?: number
          terms_and_conditions?: string | null
          preview_start?: string | null
          preview_end?: string | null
          pickup_start?: string | null
          pickup_end?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          auctioneer_id?: string
          title?: string
          description?: string | null
          starts_at?: string
          ends_at?: string
          status?: 'draft' | 'scheduled' | 'live' | 'ended' | 'completed'
          buyer_premium_percent?: number
          anti_sniping_seconds?: number
          terms_and_conditions?: string | null
          preview_start?: string | null
          preview_end?: string | null
          pickup_start?: string | null
          pickup_end?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      lots: {
        Row: {
          id: string
          auction_id: string
          lot_number: number
          title: string
          description: string | null
          starting_bid: number
          reserve_price: number | null
          increment: number
          current_high_bid: number
          bid_count: number
          category: string | null
          dimensions: string | null
          condition_report: string | null
          provenance: string | null
          estimate_low: number | null
          estimate_high: number | null
          images: Json
          winner_id: string | null
          is_sold: boolean
          hammer_price: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          auction_id: string
          lot_number: number
          title: string
          description?: string | null
          starting_bid?: number
          reserve_price?: number | null
          increment?: number
          current_high_bid?: number
          bid_count?: number
          category?: string | null
          dimensions?: string | null
          condition_report?: string | null
          provenance?: string | null
          estimate_low?: number | null
          estimate_high?: number | null
          images?: Json
          winner_id?: string | null
          is_sold?: boolean
          hammer_price?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          auction_id?: string
          lot_number?: number
          title?: string
          description?: string | null
          starting_bid?: number
          reserve_price?: number | null
          increment?: number
          current_high_bid?: number
          bid_count?: number
          category?: string | null
          dimensions?: string | null
          condition_report?: string | null
          provenance?: string | null
          estimate_low?: number | null
          estimate_high?: number | null
          images?: Json
          winner_id?: string | null
          is_sold?: boolean
          hammer_price?: number | null
          created_at?: string
          updated_at?: string
        }
      }
      bids: {
        Row: {
          id: string
          lot_id: string
          bidder_id: string
          amount: number
          type: 'regular' | 'proxy'
          max_amount: number | null
          is_winning: boolean
          created_at: string
        }
        Insert: {
          id?: string
          lot_id: string
          bidder_id: string
          amount: number
          type?: 'regular' | 'proxy'
          max_amount?: number | null
          is_winning?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          lot_id?: string
          bidder_id?: string
          amount?: number
          type?: 'regular' | 'proxy'
          max_amount?: number | null
          is_winning?: boolean
          created_at?: string
        }
      }
      wallet_ledger: {
        Row: {
          id: string
          user_id: string
          transaction_type: 'purchase' | 'bid_hold' | 'bid_refund' | 'escrow_hold' | 'escrow_release' | 'payout'
          amount: number
          balance_after: number
          description: string
          reference_id: string | null
          reference_type: string | null
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          transaction_type: 'purchase' | 'bid_hold' | 'bid_refund' | 'escrow_hold' | 'escrow_release' | 'payout'
          amount: number
          balance_after: number
          description: string
          reference_id?: string | null
          reference_type?: string | null
          metadata?: Json
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          transaction_type?: 'purchase' | 'bid_hold' | 'bid_refund' | 'escrow_hold' | 'escrow_release' | 'payout'
          amount?: number
          balance_after?: number
          description?: string
          reference_id?: string | null
          reference_type?: string | null
          metadata?: Json
          created_at?: string
        }
      }
      invoices: {
        Row: {
          id: string
          lot_id: string
          buyer_id: string
          hammer_price: number
          buyer_premium_percent: number
          buyer_premium_amount: number
          total_amount: number
          is_paid: boolean
          paid_at: string | null
          shipping_required: boolean
          is_shipped: boolean
          shipped_at: string | null
          tracking_number: string | null
          shipping_address: Json | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          lot_id: string
          buyer_id: string
          hammer_price: number
          buyer_premium_percent: number
          buyer_premium_amount: number
          total_amount: number
          is_paid?: boolean
          paid_at?: string | null
          shipping_required?: boolean
          is_shipped?: boolean
          shipped_at?: string | null
          tracking_number?: string | null
          shipping_address?: Json | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          lot_id?: string
          buyer_id?: string
          hammer_price?: number
          buyer_premium_percent?: number
          buyer_premium_amount?: number
          total_amount?: number
          is_paid?: boolean
          paid_at?: string | null
          shipping_required?: boolean
          is_shipped?: boolean
          shipped_at?: string | null
          tracking_number?: string | null
          shipping_address?: Json | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      payment_events: {
        Row: {
          id: string
          event_type: string
          processed: boolean
          payload: Json
          created_at: string
          processed_at: string | null
          provider: string
          provider_event_id: string
        }
        Insert: {
          id: string
          event_type: string
          processed?: boolean
          payload: Json
          created_at?: string
          processed_at?: string | null
          provider?: string
          provider_event_id: string
        }
        Update: {
          id?: string
          event_type?: string
          processed?: boolean
          payload?: Json
          created_at?: string
          processed_at?: string | null
          provider?: string
          provider_event_id?: string
        }
      }
      payouts_due: {
        Row: {
          id: string
          auctioneer_id: string
          invoice_id: string
          amount: number
          platform_commission: number
          is_paid: boolean
          paid_at: string | null
          payment_reference: string | null
          created_at: string
        }
        Insert: {
          id?: string
          auctioneer_id: string
          invoice_id: string
          amount: number
          platform_commission: number
          is_paid?: boolean
          paid_at?: string | null
          payment_reference?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          auctioneer_id?: string
          invoice_id?: string
          amount?: number
          platform_commission?: number
          is_paid?: boolean
          paid_at?: string | null
          payment_reference?: string | null
          created_at?: string
        }
      }
      audit_log: {
        Row: {
          id: string
          user_id: string | null
          action: string
          table_name: string
          record_id: string | null
          old_values: Json | null
          new_values: Json | null
          ip_address: string | null
          user_agent: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          action: string
          table_name: string
          record_id?: string | null
          old_values?: Json | null
          new_values?: Json | null
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          action?: string
          table_name?: string
          record_id?: string | null
          old_values?: Json | null
          new_values?: Json | null
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
      }
      admin_audit_log: {
        Row: {
          id: string
          admin_id: string
          action: string
          target_type: string
          target_id: string
          before_values: Json | null
          after_values: Json | null
          notes: string | null
          ip_address: string | null
          user_agent: string | null
          created_at: string
        }
        Insert: {
          id?: string
          admin_id: string
          action: string
          target_type: string
          target_id: string
          before_values?: Json | null
          after_values?: Json | null
          notes?: string | null
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          admin_id?: string
          action?: string
          target_type?: string
          target_id?: string
          before_values?: Json | null
          after_values?: Json | null
          notes?: string | null
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
      }
      system_announcements: {
        Row: {
          id: string
          admin_id: string
          title: string
          message: string
          severity: 'info' | 'warning' | 'urgent'
          target_roles: string[]
          is_active: boolean
          expires_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          admin_id: string
          title: string
          message: string
          severity?: 'info' | 'warning' | 'urgent'
          target_roles?: string[]
          is_active?: boolean
          expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          admin_id?: string
          title?: string
          message?: string
          severity?: 'info' | 'warning' | 'urgent'
          target_roles?: string[]
          is_active?: boolean
          expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      user_compliance_flags: {
        Row: {
          id: string
          user_id: string
          flag_type: string
          severity: 'low' | 'medium' | 'high' | 'critical'
          description: string
          flagged_by: string | null
          is_resolved: boolean
          resolved_by: string | null
          resolved_at: string | null
          resolution_notes: string | null
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          flag_type: string
          severity?: 'low' | 'medium' | 'high' | 'critical'
          description: string
          flagged_by?: string | null
          is_resolved?: boolean
          resolved_by?: string | null
          resolved_at?: string | null
          resolution_notes?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          flag_type?: string
          severity?: 'low' | 'medium' | 'high' | 'critical'
          description?: string
          flagged_by?: string | null
          is_resolved?: boolean
          resolved_by?: string | null
          resolved_at?: string | null
          resolution_notes?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
      }
      user_documents: {
        Row: {
          id: string
          user_id: string
          document_type: string
          filename: string
          file_url: string
          file_size: number | null
          mime_type: string | null
          verification_status: 'pending' | 'approved' | 'rejected'
          verified_by: string | null
          verified_at: string | null
          verification_notes: string | null
          uploaded_at: string
        }
        Insert: {
          id?: string
          user_id: string
          document_type: string
          filename: string
          file_url: string
          file_size?: number | null
          mime_type?: string | null
          verification_status?: 'pending' | 'approved' | 'rejected'
          verified_by?: string | null
          verified_at?: string | null
          verification_notes?: string | null
          uploaded_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          document_type?: string
          filename?: string
          file_url?: string
          file_size?: number | null
          mime_type?: string | null
          verification_status?: 'pending' | 'approved' | 'rejected'
          verified_by?: string | null
          verified_at?: string | null
          verification_notes?: string | null
          uploaded_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_wallet_balance: {
        Args: {
          user_uuid: string
        }
        Returns: number
      }
      add_wallet_credits: {
        Args: {
          user_uuid: string
          credit_amount: number
          provider_event_identifier: string
          purchase_description: string
        }
        Returns: boolean
      }
      place_bid: {
        Args: {
          lot_uuid: string
          bidder_uuid: string
          bid_amount: number
          bid_type_param?: 'regular' | 'proxy'
          max_amount_param?: number
        }
        Returns: Json
      }
      process_auction_end: {
        Args: {
          auction_uuid: string
        }
        Returns: Json
      }
      release_escrow_on_shipping: {
        Args: {
          invoice_uuid: string
        }
        Returns: boolean
      }
      get_user_active_bids: {
        Args: {
          user_uuid: string
        }
        Returns: {
          bid_id: string
          lot_id: string
          lot_title: string
          auction_title: string
          bid_amount: number
          is_winning: boolean
          ends_at: string
        }[]
      }
      search_lots: {
        Args: {
          search_query?: string
          category_filter?: string
          min_price?: number
          max_price?: number
          auction_status_filter?: 'draft' | 'scheduled' | 'live' | 'ended' | 'completed'
        }
        Returns: {
          lot_id: string
          lot_number: number
          title: string
          current_high_bid: number
          auction_title: string
          auction_status: 'draft' | 'scheduled' | 'live' | 'ended' | 'completed'
          ends_at: string
        }[]
      }
      change_user_role: {
        Args: {
          p_admin_id: string
          p_target_user_id: string
          p_new_role: 'bidder' | 'auctioneer' | 'admin'
          p_notes?: string
        }
        Returns: Json
      }
      change_user_status: {
        Args: {
          p_admin_id: string
          p_target_user_id: string
          p_is_approved: boolean
          p_notes?: string
        }
        Returns: Json
      }
      change_auctioneer_status: {
        Args: {
          p_admin_id: string
          p_auctioneer_id: string
          p_is_approved: boolean
          p_notes?: string
        }
        Returns: Json
      }
      get_financial_summary: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      detect_suspicious_users: {
        Args: Record<PropertyKey, never>
        Returns: {
          user_id: string
          email: string
          risk_score: number
          flags: string[]
        }[]
      }
    }
    Enums: {
      user_role: 'bidder' | 'auctioneer' | 'admin'
      auction_status: 'draft' | 'scheduled' | 'live' | 'ended' | 'completed'
      bid_type: 'regular' | 'proxy'
      transaction_type: 'purchase' | 'bid_hold' | 'bid_refund' | 'escrow_hold' | 'escrow_release' | 'payout'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type UserRole = Database['public']['Enums']['user_role']
export type AuctionStatus = Database['public']['Enums']['auction_status']
export type BidType = Database['public']['Enums']['bid_type']
export type TransactionType = Database['public']['Enums']['transaction_type']

export type User = Database['public']['Tables']['users']['Row']
export type Auctioneer = Database['public']['Tables']['auctioneers']['Row']
export type Auction = Database['public']['Tables']['auctions']['Row']
export type Lot = Database['public']['Tables']['lots']['Row']
export type Bid = Database['public']['Tables']['bids']['Row']
export type WalletLedger = Database['public']['Tables']['wallet_ledger']['Row']
export type Invoice = Database['public']['Tables']['invoices']['Row']
export type PaymentEvent = Database['public']['Tables']['payment_events']['Row']
export type PayoutDue = Database['public']['Tables']['payouts_due']['Row']
export type AuditLog = Database['public']['Tables']['audit_log']['Row']
