import { CheckCircle, CreditCard, Gavel, Search, Shield, Users } from 'lucide-react'

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-blue-600 to-purple-700 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center">
            <h1 className="text-4xl md:text-6xl font-bold mb-6">
              How It Works
            </h1>
            <p className="text-xl md:text-2xl text-blue-100 max-w-3xl mx-auto">
              Discover how our auction platform brings buyers and sellers together for unique treasures
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* For Bidders Section */}
        <section className="mb-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">For Bidders</h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Start bidding on unique items from trusted auctioneers in just a few simple steps
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="h-8 w-8 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">1. Browse & Discover</h3>
              <p className="text-gray-600">
                Explore live auctions and upcoming lots from verified auctioneers
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CreditCard className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">2. Add Credits</h3>
              <p className="text-gray-600">
                Purchase credit packs to fund your bidding activities securely
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Gavel className="h-8 w-8 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">3. Place Bids</h3>
              <p className="text-gray-600">
                Bid on items you love with automatic bid increments and anti-sniping protection
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="h-8 w-8 text-orange-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">4. Win & Pay</h3>
              <p className="text-gray-600">
                Win items and complete payment with your existing credits plus buyer's premium
              </p>
            </div>
          </div>
        </section>

        {/* For Auctioneers Section */}
        <section className="mb-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">For Auctioneers</h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Join our platform to reach a wider audience and grow your auction business
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="h-8 w-8 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">1. Apply & Verify</h3>
              <p className="text-gray-600">
                Submit your auctioneer license and business information for verification
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Gavel className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">2. Create Auctions</h3>
              <p className="text-gray-600">
                Set up your auctions with detailed lot information and high-quality images
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Shield className="h-8 w-8 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">3. Manage Safely</h3>
              <p className="text-gray-600">
                Our platform handles payments, escrow, and buyer protection automatically
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="h-8 w-8 text-orange-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">4. Get Paid</h3>
              <p className="text-gray-600">
                Receive payment automatically after successful auction completion
              </p>
            </div>
          </div>
        </section>

        {/* Key Features */}
        <section className="mb-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Platform Features</h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Built with modern technology and best practices for secure, fair auctions
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="bg-gray-50 rounded-lg p-6">
              <Shield className="h-12 w-12 text-blue-600 mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Secure Payments</h3>
              <p className="text-gray-600">
                All payments are processed securely with industry-standard encryption and fraud protection.
              </p>
            </div>

            <div className="bg-gray-50 rounded-lg p-6">
              <CheckCircle className="h-12 w-12 text-green-600 mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Anti-Sniping Protection</h3>
              <p className="text-gray-600">
                Automatic time extensions prevent last-second bid sniping, ensuring fair competition.
              </p>
            </div>

            <div className="bg-gray-50 rounded-lg p-6">
              <Users className="h-12 w-12 text-purple-600 mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Verified Auctioneers</h3>
              <p className="text-gray-600">
                All auctioneers are verified with proper licensing and business credentials.
              </p>
            </div>
          </div>
        </section>

        {/* Pricing Information */}
        <section className="bg-gray-50 rounded-2xl p-8 mb-20">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Transparent Pricing</h2>
            <p className="text-lg text-gray-600">
              No hidden fees - here's exactly what you'll pay
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="text-center">
              <h3 className="text-2xl font-semibold text-gray-900 mb-4">For Bidders</h3>
              <div className="bg-white rounded-lg p-6">
                <div className="text-3xl font-bold text-blue-600 mb-2">10%</div>
                <p className="text-gray-600 mb-4">Buyer's premium on winning bids</p>
                <ul className="text-sm text-gray-500 space-y-1">
                  <li>• No registration fees</li>
                  <li>• No bidding fees</li>
                  <li>• Only pay when you win</li>
                </ul>
              </div>
            </div>

            <div className="text-center">
              <h3 className="text-2xl font-semibold text-gray-900 mb-4">For Auctioneers</h3>
              <div className="bg-white rounded-lg p-6">
                <div className="text-3xl font-bold text-green-600 mb-2">1.2%</div>
                <p className="text-gray-600 mb-4">Platform commission on sales</p>
                <ul className="text-sm text-gray-500 space-y-1">
                  <li>• No listing fees</li>
                  <li>• No monthly fees</li>
                  <li>• Only pay when you sell</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Call to Action */}
        <section className="text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Ready to Get Started?</h2>
          <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
            Join thousands of satisfied users buying and selling unique items through our platform
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="/signup"
              className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Start Bidding
            </a>
            <a
              href="/signup"
              className="inline-flex items-center px-6 py-3 border border-gray-300 text-base font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Become an Auctioneer
            </a>
          </div>
        </section>
      </div>
    </div>
  )
}