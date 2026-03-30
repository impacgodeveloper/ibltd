import React, { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./QuickBooking.css";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  useStripe,
  useElements,
  PaymentElement,
} from "@stripe/react-stripe-js";

const API_BASE = "https://api.ironingboy.com";

const stripePromise = loadStripe(
  "pk_live_51SUiy73fSKIcHb6THsEQatj2g1tJOjUhzaym490HNFobNn6gOtdzpelQnV2knmKkXPiqxKqJjwEQ6dtSNRKuO4yx00HFqYnkEI"
);

const countryCodes = [
  { code: "+44", label: "🇬🇧 +44", minDigits: 10, maxDigits: 11 },
  { code: "+91", label: "🇮🇳 +91", minDigits: 10, maxDigits: 10 },
  { code: "+1",  label: "🇺🇸 +1",  minDigits: 10, maxDigits: 11 },
  { code: "+61", label: "🇦🇺 +61", minDigits: 9,  maxDigits: 11 },
  { code: "+971",label: "🇦🇪 +971",minDigits: 9,  maxDigits: 9  },
];

const parsePhone = (fullPhone) => {
  if (!fullPhone) return { code: "+44", local: "" };
  for (const { code } of countryCodes) {
    if (fullPhone.startsWith(code)) return { code, local: fullPhone.slice(code.length) };
  }
  return { code: "+44", local: fullPhone.replace(/^\+/, "") };
};

const stripLeadingZeros = (num) => num.replace(/^0+/, '');

const isValidEmail = (email) => {
  const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return re.test(email);
};

/* -------------------------------------------------------------------------- */
/*                       Stripe Setup/Payment Form (UI)                       */
/* -------------------------------------------------------------------------- */
const StripeSetupForm = ({
  onSetupSuccess,
  onSetupError,
  onCancel,
  setupProcessing,
  userToken,
  isSetup = true   // true = saving card (setup intent), false = one-time payment (payment intent)
}) => {
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const stripe = useStripe();
  const elements = useElements();

  const handleSubmit = async (e) => {
    e.preventDefault();

   

    if (!stripe || !elements) return;

    if (submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      let result;
      if (isSetup) {
        result = await stripe.confirmSetup({
          elements,
          redirect: "if_required",
        });
      } else {
        result = await stripe.confirmPayment({
          elements,
          redirect: "if_required",
        });
      }

      if (result.error) throw new Error(result.error.message);

      const intent = result.setupIntent || result.paymentIntent;
      if (!intent) throw new Error("Payment method not saved");

      await onSetupSuccess(intent);
    } catch (err) {
      console.error("Stripe confirm error:", err);
      setError(err.message || "Card processing failed");
      onSetupError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="stripe-payment-modal">
      <div className="stripe-modal-overlay" onClick={onCancel}></div>
      <div className="stripe-modal-content">
        <div className="stripe-modal-header">
          <div className="stripe-modal-icon">
            <i className="fas fa-shield-alt"></i>
          </div>
          <div>
            <h3>{isSetup ? "Save Card to Complete Booking" : "Confirm Card to Complete Booking"}</h3>
            <p>Your booking will be confirmed after you provide card details.</p>
          </div>
          <button
            className="stripe-modal-close"
            onClick={onCancel}
            disabled={submitting || setupProcessing}
          >
            <i className="fas fa-times"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="stripe-form">
          <div className="stripe-form-content">
            <div className="stripe-payment-info">
              <div className="stripe-info-icon">
                <i className="fas fa-credit-card"></i>
              </div>
              <div className="stripe-info-text">
                <h4>No Charges Now</h4>
                <p>Your card will only be charged after your laundry manager sends the invoice.</p>
              </div>
            </div>

            <div className="stripe-element-container">
              <PaymentElement
                options={{
                  layout: {
                    type: 'tabs',
                    defaultCollapsed: false,
                  },
                  wallets: {
                    applePay: 'never',
                    googlePay: 'never',
                  }
                }}
              />
            </div>

            {isSetup && (
              <div className="stripe-consent-section">
                {/* <div className="stripe-consent-checkbox">
                  <input
                    type="checkbox"
                    id="consent-checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    required
                  />
                  <label htmlFor="consent-checkbox" className="stripe-consent-label">
                    <span className="stripe-consent-title">Save card for future payments</span>
                    <span className="stripe-consent-description">
                      I authorise IroningBoy to securely save this card and use it for invoice payments.
                    </span>
                  </label>
                </div> */}
              </div>
            )}

            {error && (
              <div className="stripe-error-message">
                <i className="fas fa-exclamation-triangle"></i>
                <span>{error}</span>
              </div>
            )}
          </div>

          <div className="stripe-modal-actions">
           <button
  type="submit"
  disabled={!stripe || submitting || setupProcessing}
  className="stripe-confirm-btn"
>
              {submitting ? (
                <>
                  <div className="stripe-loading-spinner"></div>
                  Processing...
                </>
              ) : (
                <>
                  <i className="fas fa-lock"></i>
                  {isSetup ? "Complete Booking" : "Complete Booking"}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*                           Main Checkout Component                          */
/* -------------------------------------------------------------------------- */
export default function Checkout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, login } = useAuth();

  // Step state
  const [step, setStep] = useState(1);

  // Get items from previous page – safely default to empty array
  const { items = [], subtotal: propSubtotal, tip: propTip, total: propTotal } = location.state || {
    items: [],
    subtotal: 0,
    tip: 0,
    total: 0,
  };

  const computedSubtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const subtotal = propSubtotal !== undefined ? propSubtotal : computedSubtotal;
  const tip = propTip !== undefined ? propTip : 0;
  const total = propTotal !== undefined ? propTotal : subtotal + tip;

  // State management
  const [loading, setLoading] = useState(false);
  const [setupProcessing, setSetupProcessing] = useState(false);
  const [showPaymentSetup, setShowPaymentSetup] = useState(false);
  const [toast, setToast] = useState(null);
  const [savedCards, setSavedCards] = useState([]);
  const [loadingCards, setLoadingCards] = useState(true);
  const [setupClientSecret, setSetupClientSecret] = useState(null);
  const [paymentClientSecret, setPaymentClientSecret] = useState(null);
  const [customerId, setCustomerId] = useState(null);
  const [userToken, setUserToken] = useState(localStorage.getItem("jwtToken"));
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [showPickupAddressForm, setShowPickupAddressForm] = useState(false);
  const [pendingBookingData, setPendingBookingData] = useState(null);
  const phoneCheckTimeoutRef = useRef(null);

  // Auto-save timers and flags
  const mainAddressSaveTimerRef = useRef(null);
  const deliveryAddressSaveTimerRef = useRef(null);
  const pickupAddressSaveTimerRef = useRef(null);
  const [isDeliveryAddressSaved, setIsDeliveryAddressSaved] = useState(false);
  const [isPickupAddressSaved, setIsPickupAddressSaved] = useState(false);
  const [hasEnteredPickupDetails, setHasEnteredPickupDetails] = useState(false);

  // Geo data for addresses
  const [deliveryGeoData, setDeliveryGeoData] = useState({
    latitude: null,
    longitude: null,
    street_name: "",
    house_number: ""
  });

  const [pickupGeoData, setPickupGeoData] = useState({
    latitude: null,
    longitude: null,
    street_name: "",
    house_number: ""
  });

  // Payment option
  const [saveCardOption, setSaveCardOption] = useState(true);
  const [selectedCard, setSelectedCard] = useState(null);

  // Time slots state
  const [loadingSlots, setLoadingSlots] = useState({ collect: false, deliver: false });
  const [collectSlots, setCollectSlots] = useState([]);
  const [deliverSlots, setDeliverSlots] = useState([]);
  const [selectedCollectSlot, setSelectedCollectSlot] = useState(null);
  const [selectedDeliverSlot, setSelectedDeliverSlot] = useState(null);
  const [selectedCollectSlotStart, setSelectedCollectSlotStart] = useState(null);
  const [selectedCollectSlotEnd, setSelectedCollectSlotEnd] = useState(null);
  const [selectedDeliverSlotStart, setSelectedDeliverSlotStart] = useState(null);
  const [selectedDeliverSlotEnd, setSelectedDeliverSlotEnd] = useState(null);

  // User info and addresses
  const [userInfo, setUserInfo] = useState(() => {
    if (user) {
      return { name: user.name || "", email: user.email || "", phone: user.phone || "" };
    }
    return { name: "", email: "", phone: "" };
  });
  const [countryCode, setCountryCode] = useState("+44");
  const [localPhone, setLocalPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [phoneValid, setPhoneValid] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [emailValid, setEmailValid] = useState(false);

  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [useSameAddress, setUseSameAddress] = useState(true);
  const [selectedPickupAddressId, setSelectedPickupAddressId] = useState(null);
  const [pickupAddresses, setPickupAddresses] = useState([]);
  const [bookingInProgress, setBookingInProgress] = useState(false);

  // Manual address forms
  const [pickupPostcode, setPickupPostcode] = useState("");
  const [pickupPostcodeAddresses, setPickupPostcodeAddresses] = useState([]);
  const [selectedPickupPostcodeAddress, setSelectedPickupPostcodeAddress] = useState("");
  const [pickupAddressDetails, setPickupAddressDetails] = useState("");
  const [pickupAddressForm, setPickupAddressForm] = useState({
    street_address: "",
    postcode: "",
    city: "",
    house_number: "",
    additional_details: ""
  });

  const [deliveryPostcode, setDeliveryPostcode] = useState("");
  const [deliveryPostcodeAddresses, setDeliveryPostcodeAddresses] = useState([]);
  const [selectedDeliveryPostcodeAddress, setSelectedDeliveryPostcodeAddress] = useState("");
  const [deliveryAddressDetails, setDeliveryAddressDetails] = useState("");
  const [deliveryAddressForm, setDeliveryAddressForm] = useState({
    street_address: "",
    postcode: "",
    city: "",
    house_number: "",
    additional_details: ""
  });

  // Additional order fields
  const [isStudent, setIsStudent] = useState(false);
  const [studentIdImage, setStudentIdImage] = useState(null);
  const [changeManagerRequested, setChangeManagerRequested] = useState(false);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [topupAmount, setTopupAmount] = useState(0);

  const [collectDate, setCollectDate] = useState("");
  const [deliverDate, setDeliverDate] = useState("");
  const [notes, setNotes] = useState("");

  const [googleReady, setGoogleReady] = useState(false);

  const today = new Date().toISOString().split("T")[0];

  const showToast = useCallback((msg, type = "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Helper functions
  const formatTime24Hour = (timeString) => {
    if (!timeString) return "";
    try {
      const date = new Date(timeString);
      if (isNaN(date.getTime())) return timeString;
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${hours}:${minutes}`;
    } catch {
      return timeString;
    }
  };

  const formatTimeRange24Hour = (startTime, endTime) => {
    const start = formatTime24Hour(startTime);
    const end = formatTime24Hour(endTime);
    if (start && end) return `${start}–${end}`;
    return start || end || "";
  };

  const formatDateDDMMYYYY = (dateString) => {
    if (!dateString) return "";
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString;
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    } catch {
      return dateString;
    }
  };

  const getCardBrandIcon = (brand) => {
    const brandLower = brand?.toLowerCase() || '';
    if (brandLower.includes('visa')) return 'fab fa-cc-visa';
    if (brandLower.includes('mastercard')) return 'fab fa-cc-mastercard';
    if (brandLower.includes('amex') || brandLower.includes('american express')) return 'fab fa-cc-amex';
    if (brandLower.includes('discover')) return 'fab fa-cc-discover';
    return 'fas fa-credit-card';
  };

  // Data fetching functions
  const fetchUserProfile = useCallback(async () => {
    if (!userToken) return;
    try {
      const response = await fetch(`${API_BASE}/profile`, {
        headers: { "Authorization": `Bearer ${userToken}` },
      });
      if (response.ok) {
        const data = await response.json();
        setUserInfo({
          name: data.name || "",
          email: data.email || "",
          phone: data.phone || "",
        });
      }
    } catch (error) {
      console.error("Error fetching user profile:", error);
    }
  }, [userToken]);

  const fetchAddresses = useCallback(async () => {
    if (!userToken) return;
    try {
      const response = await fetch(`${API_BASE}/addresses`, {
        headers: { "Authorization": `Bearer ${userToken}` },
      });
      if (response.ok) {
        const data = await response.json();
        setAddresses(data);
        setPickupAddresses(data);
        if (data.length > 0) {
          const defaultAddress = data.find(addr => addr.is_selected) || data[0];
          if (defaultAddress) {
            const id = String(defaultAddress.address_id);
            setSelectedAddressId(id);
            setSelectedPickupAddressId(id);
          }
        }
      }
    } catch (error) {
      console.error("Error fetching addresses:", error);
    }
  }, [userToken]);

  const fetchSavedCards = useCallback(async () => {
    if (!userToken) {
      setLoadingCards(false);
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/stripe/saved-cards`, {
        headers: { "Authorization": `Bearer ${userToken}` },
      });
      if (response.ok) {
        const data = await response.json();
        setSavedCards(data.cards || []);
        if (data.cards?.length > 0) {
          const defaultCard = data.cards.find(card => card.is_default);
          if (defaultCard) {
            setSelectedCard(defaultCard.payment_method_id);
          } else if (data.cards.length > 0) {
            setSelectedCard(data.cards[0].payment_method_id);
          }
        }
      }
    } catch (error) {
      console.error("Error fetching saved cards:", error);
      setSavedCards([]);
    } finally {
      setLoadingCards(false);
    }
  }, [userToken]);

  const ensureStripeCustomer = useCallback(async () => {
    if (!userToken) return null;
    try {
      const response = await fetch(`${API_BASE}/stripe/create-customer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${userToken}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setCustomerId(data.customerId);
        return data.customerId;
      }
    } catch (error) {
      console.error("Error creating Stripe customer:", error);
    }
    return null;
  }, [userToken]);

  const checkPhoneNumberExists = useCallback(async (phone) => {
    if (!phone || phone.trim().length < 5) return;

    try {
      const response = await fetch(`${API_BASE}/auth/access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: `${countryCode}${phone.trim()}`,
          name: userInfo.name || "User",
          email: userInfo.email || null
        }),
      });

      if (!response.ok) return;

      const data = await response.json();

      if (data.success && data.user) {
        setUserInfo(prev => ({
          ...prev,
          name: data.user.name || prev.name,
          email: data.user.email || prev.email,
          phone: data.user.phone || prev.phone,
        }));

        if (data.token) {
          localStorage.setItem("jwtToken", data.token);
          setUserToken(data.token);
          login({
            id: data.user.id,
            name: data.user.name,
            email: data.user.email,
            phone: data.user.phone,
          });
          fetchUserProfile();
          fetchAddresses();
          fetchSavedCards();
          ensureStripeCustomer();
        }

        showToast(
          data.isNewUser ? "Account created successfully!" : "Welcome back!",
          "success"
        );
      }
    } catch (error) {
      console.error("Auth access error:", error);
    }
  }, [
    countryCode,
    userInfo.name,
    userInfo.email,
    login,
    fetchUserProfile,
    fetchAddresses,
    fetchSavedCards,
    ensureStripeCustomer,
    showToast
  ]);

  const createSetupIntent = useCallback(async (token) => {
    try {
      const response = await fetch(`${API_BASE}/stripe/init-setup-intent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create setup intent");
      }
      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Error creating setup intent:", error);
      return null;
    }
  }, []);

  const createPaymentIntent = useCallback(async (token, amount, currency = "gbp") => {
    try {
      const response = await fetch(`${API_BASE}/stripe/create-payment-intent-manual`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ amount, currency }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create payment intent");
      }
      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Error creating payment intent:", error);
      return null;
    }
  }, []);

  const saveNewAddress = useCallback(async (addressData, type = "pickup") => {
    if (!userToken) {
      showToast("Please log in to save address", "error");
      return null;
    }

    try {
      const normalize = (value) => value?.replace(/\s/g, "").toLowerCase();
      const existing = addresses.find(addr =>
        normalize(addr.postcode) === normalize(addressData.postcode)
      );
      if (existing) {
        return existing.address_id;
      }

      const payload = {
        address_type: type,
        full_address: addressData.street_address,
        additional_details: addressData.additional_details || "",
        pincode: addressData.postcode,
        postcode: addressData.postcode,
        latitude: addressData.latitude,
        longitude: addressData.longitude,
        house_number: addressData.house_number || "",
        street_name: addressData.street_name || "",
        city: addressData.city || "",
        name: type === "pickup" ? "Pickup Location" : "Delivery Address",
        is_selected: false,
      };

      const response = await fetch(`${API_BASE}/addresses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to save address");
      }

      const data = await response.json();
      showToast(`${type === "pickup" ? "Pickup" : "Delivery"} address saved`, "success");

      await fetchAddresses();
      return data.address_id;
    } catch (error) {
      console.error("Error saving address:", error);
      showToast(error.message || "Failed to save address", "error");
      return null;
    }
  }, [userToken, addresses, showToast, fetchAddresses]);

  const resetManualPickupForm = useCallback(() => {
    setPickupAddressForm({
      street_address: '',
      postcode: '',
      city: '',
      additional_details: '',
      house_number: ''
    });
    setPickupAddressDetails('');
    setPickupGeoData({ latitude: null, longitude: null, street_name: '', house_number: '' });
    setIsPickupAddressSaved(false);
    setHasEnteredPickupDetails(false);
  }, []);

  const resetManualDeliveryForm = useCallback(() => {
    setDeliveryAddressForm({
      street_address: '',
      postcode: '',
      city: '',
      additional_details: '',
      house_number: ''
    });
    setDeliveryAddressDetails('');
    setDeliveryGeoData({ latitude: null, longitude: null, street_name: '', house_number: '' });
    setIsDeliveryAddressSaved(false);
  }, []);

  const handleDeleteAddress = async (addressId) => {
    if (!window.confirm("Are you sure you want to delete this address?")) return;
    try {
      const token = userToken || localStorage.getItem("jwtToken");
      if (!token) throw new Error("Authentication required");

      const response = await fetch(`${API_BASE}/addresses/${addressId}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` },
      });

      const contentType = response.headers.get("content-type");
      let responseBody;
      if (contentType && contentType.includes("application/json")) {
        responseBody = await response.json();
      } else {
        responseBody = await response.text();
        console.error("Server responded with non-JSON:", responseBody);
      }

      if (!response.ok) {
        let errorMessage = responseBody?.message ||
          (typeof responseBody === 'string' ? responseBody : `Server error: ${response.status}`);
        if (errorMessage.includes("linked to existing orders") || errorMessage.includes("foreign key")) {
          errorMessage = "This address cannot be deleted because it has been used in past orders. You can keep it saved for future bookings.";
        }
        throw new Error(errorMessage);
      }

      const newAddresses = addresses.filter(addr => String(addr.address_id) !== String(addressId));
      setAddresses(newAddresses);
      setPickupAddresses(newAddresses);

      if (selectedAddressId === String(addressId)) {
        if (newAddresses.length > 0) {
          setSelectedAddressId(String(newAddresses[0].address_id));
          if (useSameAddress) {
            setSelectedPickupAddressId(String(newAddresses[0].address_id));
          }
        } else {
          setSelectedAddressId(null);
          setSelectedPickupAddressId(null);
        }
      }
      if (selectedPickupAddressId === String(addressId)) {
        if (newAddresses.length > 0) {
          setSelectedPickupAddressId(String(newAddresses[0].address_id));
        } else {
          setSelectedPickupAddressId(null);
        }
      }

      showToast("Address deleted successfully", "success");
    } catch (error) {
      console.error("Delete address error:", error);
      showToast(error.message, "warning");
    }
  };

  const handleDeleteCard = async (paymentMethodId) => {
    if (!window.confirm("Are you sure you want to delete this card?")) return;
    try {
      const token = userToken || localStorage.getItem("jwtToken");
      if (!token) throw new Error("Authentication required");

      const response = await fetch(`${API_BASE}/remove-card`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ paymentMethodId }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to delete card");
      }

      const updatedCards = savedCards.filter(
        card => card.payment_method_id !== paymentMethodId
      );
      setSavedCards(updatedCards);
      if (selectedCard === paymentMethodId) {
        if (updatedCards.length > 0) {
          setSelectedCard(updatedCards[0].payment_method_id);
        } else {
          setSelectedCard(null);
        }
      }
      showToast("Card removed successfully", "success");
    } catch (error) {
      console.error("Delete card error:", error);
      showToast(error.message || "Failed to delete card", "error");
    }
  };

  // Time slot fetching
  const getPostcodeForTimeSlots = useCallback((type = 'pickup') => {
    if (type === 'pickup') {
      if (useSameAddress) {
        if (userToken && addresses.length > 0 && selectedAddressId) {
          const selectedAddress = addresses.find(addr => String(addr.address_id) === selectedAddressId);
          return selectedAddress?.postcode || null;
        } else {
          return pickupPostcode || null;
        }
      } else {
        if (userToken && pickupAddresses.length > 0 && selectedPickupAddressId && selectedPickupAddressId !== "new") {
          const selectedPickupAddress = pickupAddresses.find(addr => String(addr.address_id) === selectedPickupAddressId);
          return selectedPickupAddress?.postcode || null;
        } else {
          return pickupPostcode || null;
        }
      }
    } else {
      if (userToken && addresses.length > 0 && selectedAddressId) {
        const selectedAddress = addresses.find(addr => String(addr.address_id) === selectedAddressId);
        return selectedAddress?.postcode || null;
      } else {
        return deliveryPostcode || null;
      }
    }
  }, [
    userToken, addresses, selectedAddressId, deliveryPostcode,
    useSameAddress, pickupAddresses, selectedPickupAddressId, pickupPostcode
  ]);

  const fetchTimeSlots = useCallback(async (dateIso, isDelivery = false) => {
    if (!dateIso) return [];

    const tzOffset = -new Date().getTimezoneOffset();
    const formattedDate = dateIso;
    const params = new URLSearchParams({
      date: formattedDate,
      format: "24",
      tzOffset: tzOffset.toString(),
    });

    if (isDelivery) {
      params.set("isDelivery", "true");
      if (collectDate && selectedCollectSlotStart) {
        const pickupFormattedDate = collectDate;
        const h = selectedCollectSlotStart.getHours().toString().padStart(2, "0");
        const m = selectedCollectSlotStart.getMinutes().toString().padStart(2, "0");
        params.set("pickupDate", pickupFormattedDate);
        params.set("pickupSlotStart", `${h}:${m}`);
      }
    }

    const postcode = getPostcodeForTimeSlots(isDelivery ? 'delivery' : 'pickup');
    if (postcode) {
      const cleanPostcode = postcode.replace(/\s/g, '').toUpperCase();
      params.set("postcode", cleanPostcode);
    }

    try {
      const response = await fetch(`${API_BASE}/time-slots?${params.toString()}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Server error:", errorText);
        throw new Error(`Failed to fetch slots: ${response.status}`);
      }

      const data = await response.json();
      if (data.slots && Array.isArray(data.slots)) {
        return data.slots;
      } else if (Array.isArray(data)) {
        return data;
      } else {
        console.warn("Unexpected response format, returning empty array");
        return [];
      }
    } catch (error) {
      console.error("Error fetching time slots:", error);
      showToast(`Error loading time slots: ${error.message}`, "error");
      return [];
    }
  }, [collectDate, selectedCollectSlotStart, showToast, getPostcodeForTimeSlots]);

  const fetchCollectSlots = useCallback(async () => {
    if (!collectDate) return;
    setLoadingSlots(prev => ({ ...prev, collect: true }));
    try {
      const slots = await fetchTimeSlots(collectDate, false);
      setCollectSlots(slots);
      if (selectedCollectSlot && slots.length > 0) {
        const stillValid = slots.find(
          (s) => s.start === selectedCollectSlot.start && s.enabled
        );
        if (!stillValid) {
          setSelectedCollectSlot(null);
          setSelectedCollectSlotStart(null);
          setSelectedCollectSlotEnd(null);
        }
      }
    } catch (error) {
      console.error("Error in fetchCollectSlots:", error);
      showToast("Failed to load pickup time slots. Please try again.", "error");
      setCollectSlots([]);
    } finally {
      setLoadingSlots(prev => ({ ...prev, collect: false }));
    }
  }, [collectDate, fetchTimeSlots, selectedCollectSlot, showToast]);

  const fetchDeliverySlots = useCallback(async () => {
    if (!deliverDate || !collectDate || !selectedCollectSlotStart) return;
    setLoadingSlots(prev => ({ ...prev, deliver: true }));
    try {
      const slots = await fetchTimeSlots(deliverDate, true);
      setDeliverSlots(slots);
      if (selectedDeliverSlot && slots.length > 0) {
        const stillValid = slots.find(
          (s) => s.start === selectedDeliverSlot.start && s.enabled
        );
        if (!stillValid) {
          setSelectedDeliverSlot(null);
          setSelectedDeliverSlotStart(null);
          setSelectedDeliverSlotEnd(null);
        }
      }
    } catch (error) {
      console.error("Error in fetchDeliverySlots:", error);
      showToast("Failed to load delivery time slots. Please try again.", "error");
      setDeliverSlots([]);
    } finally {
      setLoadingSlots(prev => ({ ...prev, deliver: false }));
    }
  }, [deliverDate, collectDate, selectedCollectSlotStart, fetchTimeSlots, selectedDeliverSlot, showToast]);

  // Prepare order data
  const prepareOrderData = useCallback(() => {
    if (!selectedCollectSlot || !selectedDeliverSlot || !collectDate || !deliverDate) {
      return null;
    }

    const pickupSlotText = `${formatDateDDMMYYYY(collectDate)}, ${formatTimeRange24Hour(
      selectedCollectSlot.start,
      selectedCollectSlot.end
    )}`;

    const deliverySlotText = `${formatDateDDMMYYYY(deliverDate)}, ${formatTimeRange24Hour(
      selectedDeliverSlot.start,
      selectedDeliverSlot.end
    )}`;

    // Determine if using saved addresses
    const usingSavedDelivery = userToken && addresses.length > 0 && !showAddressForm && selectedAddressId && selectedAddressId !== "new";
    const usingSavedPickup = !useSameAddress && userToken && pickupAddresses.length > 0 && !showPickupAddressForm && selectedPickupAddressId && selectedPickupAddressId !== "new";

    let deliveryAddressData = null;
    let pickupAddressData = null;

    // If not using saved delivery, we need to provide the address data from the manual forms
    if (!usingSavedDelivery) {
      if (useSameAddress) {
        // Main address manual form (same as pickup)
        deliveryAddressData = {
          street_address: pickupAddressForm.street_address,
          postcode: pickupAddressForm.postcode,
          city: pickupAddressForm.city,
          house_number: pickupGeoData.house_number || "",
          street_name: pickupGeoData.street_name || "",
          additional_details: pickupAddressDetails,
          latitude: pickupGeoData.latitude,
          longitude: pickupGeoData.longitude,
        };
      } else {
        // Separate delivery manual form
        deliveryAddressData = {
          street_address: deliveryAddressForm.street_address,
          postcode: deliveryAddressForm.postcode,
          city: deliveryAddressForm.city,
          house_number: deliveryGeoData.house_number || "",
          street_name: deliveryGeoData.street_name || "",
          additional_details: deliveryAddressDetails,
          latitude: deliveryGeoData.latitude,
          longitude: deliveryGeoData.longitude,
        };
      }
    }

    // If not using saved pickup and pickup is different from delivery
    if (!useSameAddress && !usingSavedPickup) {
      pickupAddressData = {
        street_address: pickupAddressForm.street_address,
        postcode: pickupAddressForm.postcode,
        city: pickupAddressForm.city,
        house_number: pickupGeoData.house_number || "",
        street_name: pickupGeoData.street_name || "",
        additional_details: pickupAddressDetails,
        latitude: pickupGeoData.latitude,
        longitude: pickupGeoData.longitude,
      };
    }

    const orderItems = (items || []).map(item => ({
      product_id: item.id,
      quantity: item.quantity,
      price_at_purchase: item.price,
    }));

    return {
      deliveryAddress: deliveryAddressData,
      pickupAddress: pickupAddressData,
      use_same_address: useSameAddress,
      name: userInfo.name,
      email: userInfo.email,
      phone: userInfo.phone.startsWith("+") ? userInfo.phone : `${countryCode}${userInfo.phone}`,
      collect_slot: pickupSlotText,
      delivery_slot: deliverySlotText,
      notes: notes.trim() || null,
      items: orderItems,
      subtotal: Number(subtotal),
      tip: Number(tip),
      total: Number(total),
      is_student: isStudent,
      student_id_image: studentIdImage,
      change_manager_requested: changeManagerRequested,
      discount_percent: Number(discountPercent),
      discount_amount: Number(discountAmount),
      topup_amount: Number(topupAmount),
    };
  }, [
    selectedCollectSlot,
    selectedDeliverSlot,
    collectDate,
    deliverDate,
    useSameAddress,
    userToken,
    addresses,
    showAddressForm,
    selectedAddressId,
    pickupAddresses,
    showPickupAddressForm,
    selectedPickupAddressId,
    pickupAddressForm,
    pickupGeoData,
    pickupAddressDetails,
    deliveryAddressForm,
    deliveryGeoData,
    deliveryAddressDetails,
    userInfo,
    countryCode,
    notes,
    items,
    subtotal,
    tip,
    total,
    isStudent,
    studentIdImage,
    changeManagerRequested,
    discountPercent,
    discountAmount,
    topupAmount,
  ]);

  const validateAddresses = useCallback(() => {
    const usingSavedDelivery = userToken && addresses.length > 0 && !showAddressForm && selectedAddressId && selectedAddressId !== "new";
    const usingSavedPickup = !useSameAddress && userToken && pickupAddresses.length > 0 && !showPickupAddressForm && selectedPickupAddressId && selectedPickupAddressId !== "new";

    if (useSameAddress) {
      if (!usingSavedDelivery) {
        if (!pickupGeoData.latitude || !pickupGeoData.longitude) {
          throw new Error("Please select a valid delivery address from suggestions");
        }
        if (!pickupAddressDetails.trim()) {
          throw new Error("Please enter address details (flat/door/floor)");
        }
      }
    } else {
      // Delivery address
      if (!usingSavedDelivery) {
        if (!deliveryGeoData.latitude || !deliveryGeoData.longitude) {
          throw new Error("Please select a valid delivery address from suggestions");
        }
        if (!deliveryAddressDetails.trim()) {
          throw new Error("Please enter delivery address details");
        }
      }
      // Pickup address
      if (!usingSavedPickup) {
        if (!pickupGeoData.latitude || !pickupGeoData.longitude) {
          throw new Error("Please select a valid pickup address from suggestions");
        }
        if (!pickupAddressDetails.trim()) {
          throw new Error("Please enter pickup address details");
        }
      }
    }
  }, [
    useSameAddress,
    userToken,
    addresses,
    showAddressForm,
    selectedAddressId,
    pickupAddresses,
    showPickupAddressForm,
    selectedPickupAddressId,
    pickupGeoData,
    pickupAddressDetails,
    deliveryGeoData,
    deliveryAddressDetails
  ]);

  const ensureAddressIds = useCallback(async (orderData) => {
    let deliveryId = selectedAddressId;
    let pickupId = selectedPickupAddressId;

    // Save delivery address if needed
    if (!deliveryId || deliveryId === "new") {
      if (!orderData.deliveryAddress) {
        throw new Error("Delivery address data missing");
      }
      const newId = await saveNewAddress(orderData.deliveryAddress, 'delivery');
      if (!newId) throw new Error("Failed to save delivery address");
      deliveryId = String(newId);
    }

    // Save pickup address if needed
    if (!useSameAddress) {
      if (!pickupId || pickupId === "new") {
        if (!orderData.pickupAddress) {
          throw new Error("Pickup address data missing");
        }
        const newId = await saveNewAddress(orderData.pickupAddress, 'pickup');
        if (!newId) throw new Error("Failed to save pickup address");
        pickupId = String(newId);
      }
    } else {
      pickupId = deliveryId;
    }

    return { deliveryId, pickupId };
  }, [selectedAddressId, selectedPickupAddressId, useSameAddress, saveNewAddress]);

  // Stripe flows
  const initiateStripeSetup = useCallback(async (shouldSave) => {
    setSetupProcessing(true);
    try {
      const token = userToken || localStorage.getItem("jwtToken");
      if (!token) throw new Error("Authentication token missing");

      if (shouldSave) {
        const data = await createSetupIntent(token);
        if (!data?.setupIntentClientSecret) throw new Error("Stripe setup failed");
        setSetupClientSecret(data.setupIntentClientSecret);
        setCustomerId(data.customerId || customerId);
        setShowPaymentSetup(true);
      } else {
        const data = await createPaymentIntent(token, total ); // amount in cents
        if (!data?.clientSecret) throw new Error("Payment intent failed");
        setPaymentClientSecret(data.clientSecret);
        setShowPaymentSetup(true);
      }
    } catch (err) {
      showToast(err.message || "Failed to setup payment", "error");
    } finally {
      setSetupProcessing(false);
    }
  }, [userToken, total, createSetupIntent, createPaymentIntent, customerId, showToast]);

  const handleConfirmBooking = async () => {
    if (bookingInProgress) return;
    setBookingInProgress(true);
    setLoading(true);

    try {
      validateAddresses();
      const order = prepareOrderData();
      if (!order) throw new Error("Please select pickup and delivery times");
      setPendingBookingData(order);
      await initiateStripeSetup(saveCardOption);
    } catch (error) {
      showToast(error.message || "Booking failed", "error");
    } finally {
      setLoading(false);
      setBookingInProgress(false);
    }
  };

  const handleSavedCardBooking = async () => {
    if (!selectedCard) {
      showToast("Please select a saved card", "error");
      return;
    }

    setLoading(true);

    try {
      validateAddresses();
      const order = prepareOrderData();
      if (!order) throw new Error("Please select pickup and delivery times");

      const { deliveryId, pickupId } = await ensureAddressIds(order);

      const token = userToken || localStorage.getItem("jwtToken");
      if (!token) throw new Error("Authentication required");

      let currentCustomerId = customerId;
      if (!currentCustomerId) {
        currentCustomerId = await ensureStripeCustomer();
        if (!currentCustomerId) throw new Error("Failed to set up payment customer");
      }

      const selectedCardData = savedCards.find(
        card => card.payment_method_id === selectedCard
      );
      if (!selectedCardData) throw new Error("Selected card not found");

      const payload = {
        address_id: deliveryId,
        pickup_address_id: pickupId,
        use_same_address: useSameAddress,
        items: order.items,
        subtotal: order.subtotal,
        tip: order.tip,
        total: order.total,
        collect_slot: order.collect_slot,
        delivery_slot: order.delivery_slot,
        notes: order.notes,
        images: [],
        is_student: order.is_student,
        student_id_image: order.student_id_image,
        change_manager_requested: order.change_manager_requested,
        discount_percent: order.discount_percent,
        discount_amount: order.discount_amount,
        topup_amount: order.topup_amount,
        payment_method_id: selectedCardData.payment_method_id,
        stripe_customer_id: currentCustomerId,
      };

      const response = await fetch(`${API_BASE}/api/orders`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Booking failed");
      }

      localStorage.removeItem('laundryCart');
      showToast("Booking confirmed successfully!", "success");

      navigate("/thankyou", {
        state: {
          orderId: data.orderId,
          paymentStatus: "saved_card",
          paymentMethod: "saved_card",
          pickupDate: formatDateDDMMYYYY(collectDate),
          pickupTime: formatTimeRange24Hour(selectedCollectSlot.start, selectedCollectSlot.end),
          deliveryDate: formatDateDDMMYYYY(deliverDate),
          deliveryTime: formatTimeRange24Hour(selectedDeliverSlot.start, selectedDeliverSlot.end),
        }
      });
    } catch (error) {
      console.error(error);
      showToast(error.message || "Booking failed", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleUseAnotherCard = async () => {
    try {
      validateAddresses();
      const order = prepareOrderData();
      if (!order) throw new Error("Please complete booking details");
      setPendingBookingData(order);
      await initiateStripeSetup(true); // always save new card
    } catch (err) {
      showToast(err.message || "Failed to setup card", "error");
    }
  };

  const handleSetupSuccess = async (intent) => {
    setSetupProcessing(true);
    try {
      const token = userToken || localStorage.getItem("jwtToken");
      if (!token) throw new Error("Authentication required");
      if (!pendingBookingData) throw new Error("Booking data missing");

      let paymentMethodId = null;
      let paymentIntentId = null;

      if (saveCardOption) {
        paymentMethodId = intent.payment_method || intent.latest_attempt?.payment_method;
        if (!paymentMethodId) throw new Error("Payment method not returned by Stripe");
        if (customerId) {
          await fetch(`${API_BASE}/stripe/set-default-payment`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ customerId, paymentMethodId }),
          });
        }
      } else {
        paymentIntentId = intent.id;
        if (!paymentIntentId) throw new Error("Payment intent not returned");
      }

      const { deliveryId, pickupId } = await ensureAddressIds(pendingBookingData);

      const payload = {
        address_id: deliveryId,
        pickup_address_id: pickupId,
        use_same_address: useSameAddress,
        items: pendingBookingData.items,
        subtotal: pendingBookingData.subtotal,
        tip: pendingBookingData.tip,
        total: pendingBookingData.total,
        collect_slot: pendingBookingData.collect_slot,
        delivery_slot: pendingBookingData.delivery_slot,
        notes: pendingBookingData.notes,
        images: [],
        is_student: pendingBookingData.is_student,
        student_id_image: pendingBookingData.student_id_image,
        change_manager_requested: pendingBookingData.change_manager_requested,
        discount_percent: pendingBookingData.discount_percent,
        discount_amount: pendingBookingData.discount_amount,
        topup_amount: pendingBookingData.topup_amount,
        payment_method_id: paymentMethodId,
        payment_intent_id: paymentIntentId,
        stripe_customer_id: customerId,
      };

      const response = await fetch(`${API_BASE}/api/orders`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to create booking");
      }

      setShowPaymentSetup(false);
      setPendingBookingData(null);

      showToast("Booking confirmed successfully!", "success");

      setTimeout(() => {
        navigate("/thankyou", {
          state: {
            orderId: data.orderId,
            paymentStatus: saveCardOption ? "card_saved" : "card_authorized",
            paymentMethod: saveCardOption ? "new_card_saved" : "new_card_one_time",
            pickupDate: formatDateDDMMYYYY(collectDate),
            pickupTime: formatTimeRange24Hour(
              selectedCollectSlot?.start,
              selectedCollectSlot?.end
            ),
            deliveryDate: formatDateDDMMYYYY(deliverDate),
            deliveryTime: formatTimeRange24Hour(
              selectedDeliverSlot?.start,
              selectedDeliverSlot?.end
            ),
          },
        });
      }, 1000);
    } catch (error) {
      showToast(error.message || "Failed to complete booking", "error");
    } finally {
      setSetupProcessing(false);
    }
  };

  const handleSetupError = (errorMessage) => {
    showToast(errorMessage || "Failed to save card. Please try again.", "error");
  };

  const handlePaymentModalCancel = () => {
    setShowPaymentSetup(false);
    setSetupClientSecret(null);
    setPaymentClientSecret(null);
    setPendingBookingData(null);
    setSetupProcessing(false);
    showToast("Booking not confirmed. Please complete card setup to confirm your booking.", "warning");
  };

  // Phone and email validation
  const getExpectedPhoneLength = () => {
    const country = countryCodes.find(c => c.code === countryCode);
    return country ? country.minDigits : 10;
  };

  const validatePhone = useCallback(async (fullPhone, localRaw) => {
    const cleanedLocal = stripLeadingZeros(localRaw.replace(/\D/g, ''));
    const expectedLen = getExpectedPhoneLength();

    if (cleanedLocal.length !== expectedLen) {
      setPhoneError("Enter a valid mobile number");
      setPhoneValid(false);
      return false;
    }

    try {
      const res = await fetch(`${API_BASE}/validate-phone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: fullPhone }),
      });

      const data = await res.json();

      if (!data.valid) {
        setPhoneError(data.message || "Enter a valid mobile number");
        setPhoneValid(false);
        return false;
      }

      setPhoneError("");
      setPhoneValid(true);
      return true;
    } catch {
      setPhoneError("Validation failed");
      setPhoneValid(false);
      return false;
    }
  }, [countryCode]);

  const validateEmail = useCallback((email) => {
    if (!email.trim()) {
      setEmailError("Email is required");
      setEmailValid(false);
      return false;
    }
    if (!isValidEmail(email)) {
      setEmailError("Please enter a valid email address");
      setEmailValid(false);
      return false;
    }
    setEmailError("");
    setEmailValid(true);
    return true;
  }, []);

  const handlePhoneChange = (e) => {
    let raw = e.target.value;
    raw = raw.replace(/\D/g, '');
    setLocalPhone(raw);

    const cleanedLocal = stripLeadingZeros(raw);
    const full = countryCode + cleanedLocal;
    setUserInfo(prev => ({ ...prev, phone: full }));

    clearTimeout(phoneCheckTimeoutRef.current);

    const expectedLen = getExpectedPhoneLength();
    if (raw.length >= expectedLen) {
      phoneCheckTimeoutRef.current = setTimeout(() => {
        validatePhone(full, raw);
      }, 800);
    } else {
      setPhoneError(`Please enter a valid ${expectedLen}-digit number`);
      setPhoneValid(false);
    }
  };

  const handleCountryCodeChange = (e) => {
    const code = e.target.value;
    setCountryCode(code);
    if (localPhone.trim().length >= getExpectedPhoneLength()) {
      const cleanedLocal = stripLeadingZeros(localPhone);
      const full = code + cleanedLocal;
      setUserInfo(prev => ({ ...prev, phone: full }));
      clearTimeout(phoneCheckTimeoutRef.current);
      phoneCheckTimeoutRef.current = setTimeout(() => {
        validatePhone(full, localPhone);
      }, 800);
    } else {
      setPhoneError(`Please enter a valid ${getExpectedPhoneLength()}-digit number`);
      setPhoneValid(false);
    }
  };

  const handleEmailChange = (e) => {
    const v = e.target.value;
    setUserInfo(prev => ({ ...prev, email: v }));
    validateEmail(v);
  };

  const handleNameChange = (e) => {
    const v = e.target.value;
    setUserInfo(prev => ({ ...prev, name: v }));
  };

  const handleCollectDateChange = (e) => {
    const newDate = e.target.value;
    setCollectDate(newDate);
    setSelectedCollectSlot(null);
    setSelectedCollectSlotStart(null);
    setSelectedCollectSlotEnd(null);
    setSelectedDeliverSlot(null);
    setSelectedDeliverSlotStart(null);
    setSelectedDeliverSlotEnd(null);
    setDeliverSlots([]);
  };

  const handleDeliverDateChange = (e) => {
    const newDate = e.target.value;
    if (collectDate && newDate < collectDate) {
      showToast("Delivery date cannot be before pickup date", "error");
      return;
    }
    setDeliverDate(newDate);
    setSelectedDeliverSlot(null);
    setSelectedDeliverSlotStart(null);
    setSelectedDeliverSlotEnd(null);
    setDeliverSlots([]);
  };

  const handleCollectSlotSelect = (slot) => {
    if (!slot.enabled) return;
    const start = new Date(slot.start);
    const end = slot.end ? new Date(slot.end) : null;
    setSelectedCollectSlot(slot);
    setSelectedCollectSlotStart(start);
    setSelectedCollectSlotEnd(end);
    setSelectedDeliverSlot(null);
    setSelectedDeliverSlotStart(null);
    setSelectedDeliverSlotEnd(null);
    setDeliverSlots([]);
  };

  const handleDeliverSlotSelect = (slot) => {
    if (!slot.enabled) return;
    const start = new Date(slot.start);
    const end = slot.end ? new Date(slot.end) : null;
    setSelectedDeliverSlot(slot);
    setSelectedDeliverSlotStart(start);
    setSelectedDeliverSlotEnd(end);
  };

  const handleToggleSameAddress = (e) => {
    const checked = e.target.checked;
    setUseSameAddress(checked);
    if (checked) {
      setPickupAddressForm({ ...deliveryAddressForm });
      setPickupPostcode(deliveryPostcode);
      setPickupGeoData({ ...deliveryGeoData });
      setPickupAddressDetails(deliveryAddressDetails);
      setSelectedPickupAddressId(selectedAddressId);
    }
  };

  // Auto-save main address (when useSameAddress = true)
  useEffect(() => {
    if (!userToken) return;
    if (!useSameAddress) return;
    const manualMode = !selectedAddressId || selectedAddressId === "new" || addresses.length === 0;
    if (!manualMode) return;

    const hasAddress = pickupAddressForm.street_address.trim() !== "" &&
                       pickupAddressForm.postcode.trim() !== "" &&
                       pickupGeoData.latitude !== null &&
                       pickupGeoData.longitude !== null &&
                       hasEnteredPickupDetails &&
                       pickupAddressDetails.trim() !== "";

    if (mainAddressSaveTimerRef.current) clearTimeout(mainAddressSaveTimerRef.current);

    if (hasAddress && !isDeliveryAddressSaved) {
      mainAddressSaveTimerRef.current = setTimeout(async () => {
        const newId = await saveNewAddress(
          {
            street_address: pickupAddressForm.street_address,
            postcode: pickupAddressForm.postcode,
            additional_details: pickupAddressDetails,
            house_number: pickupGeoData.house_number,
            latitude: pickupGeoData.latitude,
            longitude: pickupGeoData.longitude,
            street_name: pickupGeoData.street_name,
          },
          "delivery"
        );
        if (newId) {
          setSelectedAddressId(String(newId));
          setIsDeliveryAddressSaved(true);
        }
      }, 1000);
    }

    return () => {
      if (mainAddressSaveTimerRef.current) clearTimeout(mainAddressSaveTimerRef.current);
    };
  }, [userToken, useSameAddress, selectedAddressId, addresses.length, pickupAddressForm, pickupGeoData, pickupAddressDetails, hasEnteredPickupDetails, isDeliveryAddressSaved, saveNewAddress]);

  useEffect(() => {
    if (userInfo.phone) {
      const { code, local } = parsePhone(userInfo.phone);
      setCountryCode(code);
      setLocalPhone(local);
    }
  }, [userInfo.phone]);

  useEffect(() => {
    if (userInfo.email) {
      validateEmail(userInfo.email);
    }
    if (userInfo.phone) {
      const { code, local } = parsePhone(userInfo.phone);
      const cleanedLocal = stripLeadingZeros(local);
      const fullPhone = code + cleanedLocal;
      validatePhone(fullPhone, local);
    }
  }, [userInfo, validateEmail, validatePhone]);

  // Auto-save delivery address when useSameAddress = false
  useEffect(() => {
    if (!userToken) return;
    if (useSameAddress) return;
   const manualMode =
  !selectedAddressId ||
  selectedAddressId === "new" 
    if (!manualMode) return;

    const hasAddress = deliveryAddressForm.street_address.trim() !== "" &&
                       deliveryAddressForm.postcode.trim() !== "" &&
                       deliveryGeoData.latitude !== null &&
                       deliveryGeoData.longitude !== null &&
                       deliveryAddressDetails.trim() !== "";

    if (deliveryAddressSaveTimerRef.current) clearTimeout(deliveryAddressSaveTimerRef.current);

    if (hasAddress && !isDeliveryAddressSaved) {
      deliveryAddressSaveTimerRef.current = setTimeout(async () => {
        const newId = await saveNewAddress(
          {
            street_address: deliveryAddressForm.street_address,
            postcode: deliveryAddressForm.postcode,
            additional_details: deliveryAddressDetails,
            house_number: deliveryGeoData.house_number,
            latitude: deliveryGeoData.latitude,
            longitude: deliveryGeoData.longitude,
            street_name: deliveryGeoData.street_name,
          },
          "delivery"
        );
        if (newId) {
          setSelectedAddressId(String(newId));
          setIsDeliveryAddressSaved(true);
        }
      }, 1000);
    }

    return () => {
      if (deliveryAddressSaveTimerRef.current) clearTimeout(deliveryAddressSaveTimerRef.current);
    };
  }, [userToken, useSameAddress, selectedAddressId, addresses.length, deliveryAddressForm, deliveryGeoData, deliveryAddressDetails, isDeliveryAddressSaved, saveNewAddress]);

  // Auto-save pickup address when useSameAddress = false
  useEffect(() => {
    if (!userToken) return;
    if (useSameAddress) return;
    if (!showPickupAddressForm) return;
    const manualMode = !selectedPickupAddressId || selectedPickupAddressId === "new" || pickupAddresses.length === 0;
    if (!manualMode) return;

    const hasAddress = pickupAddressForm.street_address.trim() !== "" &&
                       pickupAddressForm.postcode.trim() !== "" &&
                       pickupGeoData.latitude !== null &&
                       pickupGeoData.longitude !== null &&
                       hasEnteredPickupDetails &&
                       pickupAddressDetails.trim() !== "";

    if (pickupAddressSaveTimerRef.current) clearTimeout(pickupAddressSaveTimerRef.current);

    if (hasAddress && !isPickupAddressSaved) {
      pickupAddressSaveTimerRef.current = setTimeout(async () => {
        const newId = await saveNewAddress(
          {
            street_address: pickupAddressForm.street_address,
            postcode: pickupAddressForm.postcode,
            additional_details: pickupAddressDetails,
            house_number: pickupGeoData.house_number,
            latitude: pickupGeoData.latitude,
            longitude: pickupGeoData.longitude,
            street_name: pickupGeoData.street_name,
          },
          "pickup"
        );
        if (newId) {
          setSelectedPickupAddressId(String(newId));
          setIsPickupAddressSaved(true);
          resetManualPickupForm();
          setShowPickupAddressForm(false);
        }
      }, 1000);
    }

    return () => {
      if (pickupAddressSaveTimerRef.current) clearTimeout(pickupAddressSaveTimerRef.current);
    };
  }, [
    userToken, useSameAddress, showPickupAddressForm, selectedPickupAddressId, pickupAddresses.length,
    pickupAddressForm, pickupGeoData, pickupAddressDetails, hasEnteredPickupDetails,
    isPickupAddressSaved, saveNewAddress, resetManualPickupForm
  ]);

  // Reset pickup form when street address changes (to trigger re-save if needed)
  useEffect(() => {
    if (!useSameAddress && showPickupAddressForm) {
      setHasEnteredPickupDetails(false);
      setIsPickupAddressSaved(false);
    }
  }, [pickupAddressForm.street_address, useSameAddress, showPickupAddressForm]);

  // Google Places setup
  useEffect(() => {
    const checkGoogle = () => {
      if (window.google && window.google.maps && window.google.maps.places) {
        setGoogleReady(true);
      } else {
        setTimeout(checkGoogle, 300);
      }
    };
    checkGoogle();
  }, []);

  // Autocomplete for pickup address (used for both main address when useSameAddress true, and separate pickup)
  useEffect(() => {
    if (!googleReady) return;
    const input = document.getElementById('pickup-address-input');
    if (!input) return;

    const autocomplete = new window.google.maps.places.Autocomplete(input, {
      types: ["address"],
      componentRestrictions: { country: "gb" }
    });

    const listener = autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (!place.geometry) return;

      let street = "", house = "", postcode = "", city = "";
      place.address_components.forEach(c => {
        if (c.types.includes("route")) street = c.long_name;
        if (c.types.includes("street_number")) house = c.long_name;
        if (c.types.includes("postal_code")) postcode = c.long_name;
        if (c.types.includes("postal_town")) city = c.long_name;
      });

      setPickupGeoData({
        latitude: place.geometry.location.lat(),
        longitude: place.geometry.location.lng(),
        street_name: street,
        house_number: house
      });
      setPickupAddressForm({
        street_address: place.formatted_address,
        postcode,
        city,
        house_number: house,
        additional_details: pickupAddressDetails
      });
    });

    return () => {
      window.google.maps.event.removeListener(listener);
    };
  }, [googleReady, pickupAddressDetails]);

  // Autocomplete for delivery address (when useSameAddress = false)
  useEffect(() => {
    if (!googleReady) return;
    const input = document.getElementById('delivery-address-input');
    if (!input) return;

    const autocomplete = new window.google.maps.places.Autocomplete(input, {
      types: ["address"],
      componentRestrictions: { country: "gb" }
    });

    const listener = autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (!place.geometry) return;

      let street = "", house = "", postcode = "", city = "";
      place.address_components.forEach(c => {
        if (c.types.includes("route")) street = c.long_name;
        if (c.types.includes("street_number")) house = c.long_name;
        if (c.types.includes("postal_code")) postcode = c.long_name;
        if (c.types.includes("postal_town")) city = c.long_name;
      });

      setDeliveryGeoData({
        latitude: place.geometry.location.lat(),
        longitude: place.geometry.location.lng(),
        street_name: street,
        house_number: house
      });
      setDeliveryAddressForm({
        street_address: place.formatted_address,
        postcode,
        city,
        house_number: house,
        additional_details: deliveryAddressDetails
      });
    });

    return () => {
      window.google.maps.event.removeListener(listener);
    };
  }, [googleReady, deliveryAddressDetails]);

  // Postcode lookups for pickup
  useEffect(() => {
    if (!googleReady) return;
    const clean = pickupPostcode.trim();
    if (clean.length >= 3) {
      const service = new window.google.maps.places.AutocompleteService();
      service.getPlacePredictions(
        {
          input: clean,
          componentRestrictions: { country: "gb" }
        },
        (predictions, status) => {
          if (status !== window.google.maps.places.PlacesServiceStatus.OK || !predictions) {
            setPickupPostcodeAddresses([]);
            return;
          }
          setPickupPostcodeAddresses(
            predictions.map(p => ({ full: p.description, place_id: p.place_id }))
          );
        }
      );
    } else {
      setPickupPostcodeAddresses([]);
    }
  }, [pickupPostcode, googleReady]);

  useEffect(() => {
    if (!googleReady || !selectedPickupPostcodeAddress) return;
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ placeId: selectedPickupPostcodeAddress }, (results, status) => {
      if (status !== "OK" || !results[0]) return;
      const result = results[0];
      let street = "", house = "", postcode = "", city = "";
      result.address_components.forEach(c => {
        if (c.types.includes("route")) street = c.long_name;
        if (c.types.includes("street_number")) house = c.long_name;
        if (c.types.includes("postal_code")) postcode = c.long_name;
        if (c.types.includes("postal_town")) city = c.long_name;
      });
      setPickupGeoData({
        latitude: result.geometry.location.lat(),
        longitude: result.geometry.location.lng(),
        street_name: street,
        house_number: house
      });
      setPickupAddressForm({
        street_address: result.formatted_address,
        postcode,
        city,
        house_number: house,
        additional_details: pickupAddressDetails
      });
    });
  }, [selectedPickupPostcodeAddress, googleReady, pickupAddressDetails]);

  // Postcode lookups for delivery
  useEffect(() => {
    if (!googleReady) return;
    const clean = deliveryPostcode.trim();
    if (clean.length >= 3) {
      const service = new window.google.maps.places.AutocompleteService();
      service.getPlacePredictions(
        {
          input: clean,
          componentRestrictions: { country: "gb" }
        },
        (predictions, status) => {
          if (status !== window.google.maps.places.PlacesServiceStatus.OK || !predictions) {
            setDeliveryPostcodeAddresses([]);
            return;
          }
          setDeliveryPostcodeAddresses(
            predictions.map(p => ({ full: p.description, place_id: p.place_id }))
          );
        }
      );
    } else {
      setDeliveryPostcodeAddresses([]);
    }
  }, [deliveryPostcode, googleReady]);

  useEffect(() => {
    if (!googleReady || !selectedDeliveryPostcodeAddress) return;
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ placeId: selectedDeliveryPostcodeAddress }, (results, status) => {
      if (status !== "OK" || !results[0]) return;
      const result = results[0];
      let street = "", house = "", postcode = "", city = "";
      result.address_components.forEach(c => {
        if (c.types.includes("route")) street = c.long_name;
        if (c.types.includes("street_number")) house = c.long_name;
        if (c.types.includes("postal_code")) postcode = c.long_name;
        if (c.types.includes("postal_town")) city = c.long_name;
      });
      setDeliveryGeoData({
        latitude: result.geometry.location.lat(),
        longitude: result.geometry.location.lng(),
        street_name: street,
        house_number: house
      });
      setDeliveryAddressForm({
        street_address: result.formatted_address,
        postcode,
        city,
        house_number: house,
        additional_details: deliveryAddressDetails
      });
    });
  }, [selectedDeliveryPostcodeAddress, googleReady, deliveryAddressDetails]);

  // Fetch slots
  useEffect(() => {
    if (collectDate) {
      const timer = setTimeout(fetchCollectSlots, 300);
      return () => clearTimeout(timer);
    }
  }, [collectDate, fetchCollectSlots]);

  useEffect(() => {
    if (deliverDate && selectedCollectSlotStart) {
      const timer = setTimeout(fetchDeliverySlots, 300);
      return () => clearTimeout(timer);
    }
  }, [deliverDate, selectedCollectSlotStart, fetchDeliverySlots]);

  // Initial data fetch
  useEffect(() => {
    if (userToken) {
      fetchUserProfile();
      fetchAddresses();
      fetchSavedCards();
      ensureStripeCustomer();
    } else {
      setLoadingCards(false);
    }
  }, [userToken, fetchUserProfile, fetchAddresses, fetchSavedCards, ensureStripeCustomer]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (phoneCheckTimeoutRef.current) clearTimeout(phoneCheckTimeoutRef.current);
    };
  }, []);

  // Step validation
  const stepDone = (s) => {
    if (s === 1) {
      const phoneLen = stripLeadingZeros(localPhone).length;
      const expectedLen = getExpectedPhoneLength();
      return !!(userInfo.name.trim() && emailValid && phoneValid);
    }
    if (s === 2) {
      // Check if address is valid based on existing logic
      try {
        validateAddresses();
        return true;
      } catch {
        return false;
      }
    }
    if (s === 3) {
      return !!(selectedCollectSlot && selectedDeliverSlot);
    }
    if (s === 4) {
      // Payment step validation: just check that booking can proceed
      try {
        validateAddresses();
        return !!(selectedCollectSlot && selectedDeliverSlot && userInfo.name.trim() && emailValid);
      } catch {
        return false;
      }
    }
    return false;
  };

  const isBookingValid = () => {
    try {
      validateAddresses();
      return !!(selectedCollectSlot && selectedDeliverSlot && userInfo.name.trim() && emailValid && phoneValid);
    } catch {
      return false;
    }
  };

  // Handle continue from step 1 to step 2: create/update user
  const handleContinueToAddress = async () => {
    if (!stepDone(1)) return;
    setLoading(true);
    try {
      const fullPhone = `${countryCode}${stripLeadingZeros(localPhone)}`;
      if (!userToken) {
        // New user: create account
        await checkPhoneNumberExists(localPhone);
      } else {
        // Existing user: update profile with latest info
        await fetch(`${API_BASE}/profile`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${userToken}`,
          },
          body: JSON.stringify({
            name: userInfo.name,
            email: userInfo.email,
            phone: fullPhone,
          }),
        });
      }
      // Refresh data
      await Promise.all([fetchAddresses(), fetchSavedCards()]);
      setStep(2);
    } catch (err) {
      showToast(err.message || "Failed to continue", "error");
    } finally {
      setLoading(false);
    }
  };

  const STEPS = [
    { id: 1, label: "Your Info", icon: <i className="fas fa-user" /> },
    { id: 2, label: "Address",   icon: <i className="fas fa-map-marker-alt" /> },
    { id: 3, label: "Schedule",  icon: <i className="fas fa-calendar-alt" /> },
    { id: 4, label: "Payment",   icon: <i className="fas fa-credit-card" /> },
  ];

  const minDeliveryDate = collectDate || today;

  return (
    <div className="qb-page">
      <header className="qb-header">
        <button className="qb-back-btn" onClick={() => navigate(-1)} aria-label="Go back">
          <i className="fas fa-arrow-left" />
        </button>
        <div className="qb-header-brand">
          <span className="qb-logo">Ironing<span>Boy</span></span>
          <span className="qb-header-tag">Checkout</span>
        </div>
        {userToken && (
          <div className="qb-welcome-chip">
            <i className="fas fa-user-check" />
            {userInfo.name?.split(" ")[0] || "Welcome back"}
          </div>
        )}
      </header>

      <nav className="qb-steps-nav">
        {STEPS.map((s) => (
          <button
            key={s.id}
            className={`qb-step-btn${step === s.id ? " active" : ""}${stepDone(s.id) ? " done" : ""}`}
            onClick={() => setStep(s.id)}
          >
            <div className="qb-step-bubble">
              {stepDone(s.id) ? <i className="fas fa-check" /> : s.icon}
            </div>
            <span className="qb-step-btn-label">{s.label}</span>
          </button>
        ))}
      </nav>

      <main className="qb-main">

        {/* ════════ STEP 1 — Personal Info ════════ */}
        {step === 1 && (
          <div className="qb-section-card">
            <h2 className="qb-section-title">Your Information</h2>
            <p className="qb-section-desc">We'll use this to contact you about your order.</p>

            <div className="qb-form-row">
              <div className="qb-field">
                <label className="qb-label">Full Name</label>
                <input
                  className="qb-input"
                  type="text"
                  value={userInfo.name}
                  onChange={handleNameChange}
                  placeholder="John Smith"
                />
              </div>
              <div className="qb-field">
                <label className="qb-label">Email Address</label>
                <input
                  className="qb-input"
                  type="email"
                  value={userInfo.email}
                  onChange={handleEmailChange}
                  placeholder="john@example.com"
                />
                {emailError && <div className="qb-error-message"><i className="fas fa-exclamation-circle" /> {emailError}</div>}
              </div>
            </div>

            <div className="qb-field">
              <label className="qb-label">Phone Number</label>
              <div className="qb-phone-row">
                <select className="qb-country-code" value={countryCode} onChange={handleCountryCodeChange}>
                  {countryCodes.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                </select>
                <input
                  className="qb-phone-input"
                  type="tel"
                  value={localPhone}
                  onChange={handlePhoneChange}
                  placeholder="Enter mobile number"
                />
              </div>
              {phoneError && <div className="qb-error-message"><i className="fas fa-exclamation-circle" /> {phoneError}</div>}
            </div>

            <button
              className="qb-btn-primary"
              onClick={handleContinueToAddress}
              disabled={!stepDone(1) || loading}
            >
              {loading ? (
                <><div className="qb-btn-spinner" /> Processing…</>
              ) : (
                <>Continue to Address <i className="fas fa-arrow-right" /></>
              )}
            </button>
          </div>
        )}

        {/* ════════ STEP 2 — Address ════════ */}
        {step === 2 && (
          <div className="qb-section-card">
            <h2 className="qb-section-title">Pickup & Delivery Address</h2>
            <p className="qb-section-desc">Where should we collect your laundry and where to return it?</p>

            {/* Pickup Address Section (can be same as delivery) */}
            <div className="qb-sub-section">
              <h3 className="qb-sub-title"><i className="fas fa-map-marker-alt" /> Pickup Address</h3>
              {userToken && addresses.length > 0 && !showAddressForm ? (
                <>
                  <div className="qb-address-list">
                    {addresses.map((addr) => (
                      <div
                        key={addr.address_id}
                        className={`qb-address-card${selectedAddressId === String(addr.address_id) ? " selected" : ""}`}
                        onClick={() => {
                          const id = String(addr.address_id);
                          setSelectedAddressId(id);
                          if (useSameAddress) setSelectedPickupAddressId(id);
                        }}
                      >
                        <div className="qb-address-card-body">
                          <div className="qb-address-card-icon"><i className="fas fa-home" /></div>
                          <div>
                            <div className="qb-address-name">
                              {addr.name || "Home"}
                              {addr.is_selected && <span className="qb-badge"><i className="fas fa-star" /> Default</span>}
                            </div>
                            <div className="qb-address-line">{addr.full_address}</div>
                            <div className="qb-address-pc"><i className="fas fa-map-pin" /> {addr.postcode}</div>
                          </div>
                        </div>
                        {selectedAddressId === String(addr.address_id) && (
                          <div className="qb-check-circle"><i className="fas fa-check" /></div>
                        )}
                        <button className="qb-addr-del" onClick={(e) => { e.stopPropagation(); handleDeleteAddress(addr.address_id); }}>
                          <i className="fas fa-trash" />
                        </button>
                      </div>
                    ))}
                    <div className="qb-add-new-card" onClick={() => { setShowAddressForm(true); setSelectedAddressId(null); }}>
                      <div className="qb-add-icon"><i className="fas fa-plus" /></div>
                      <div><strong>Add New Address</strong><small>Enter a different address</small></div>
                    </div>
                  </div>
                </>
              ) : (
                <div>
                  <div className="qb-form-row">
                    <div className="qb-field">
                      <label className="qb-label">Postcode</label>
                      <input
                        type="text"
                        className="qb-input"
                        value={pickupPostcode}
                        onChange={(e) => setPickupPostcode(e.target.value.toUpperCase())}
                        placeholder="SW1A 2AA"
                      />
                    </div>
                    <div className="qb-field">
                      <label className="qb-label">Select Address</label>
                      <select
                        className="qb-select"
                        value={selectedPickupPostcodeAddress}
                        onChange={(e) => setSelectedPickupPostcodeAddress(e.target.value)}
                      >
                        <option value="">Select address</option>
                        {pickupPostcodeAddresses.map((addr, idx) => (
                          <option key={idx} value={addr.place_id}>{addr.full}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="qb-field">
                    <label className="qb-label">Address details</label>
                    <input
                      type="text"
                      className="qb-input"
                      placeholder="Flat / Door / Floor"
                      value={pickupAddressDetails}
                      onChange={(e) => {
                        setPickupAddressDetails(e.target.value);
                        if (e.target.value.trim().length > 0) {
                          setHasEnteredPickupDetails(true);
                        } else {
                          setHasEnteredPickupDetails(false);
                        }
                        setIsPickupAddressSaved(false);
                      }}
                    />
                  </div>
                </div>
              )}

              {userToken && addresses.length > 0 && showAddressForm && (
                <button className="qb-btn-ghost" onClick={() => { resetManualPickupForm(); setShowAddressForm(false); }}>
                  <i className="fas fa-arrow-left" /> Back to Saved Addresses
                </button>
              )}

              <label className="qb-toggle-row" style={{ marginTop: "16px" }}>
                <input type="checkbox" checked={useSameAddress} onChange={handleToggleSameAddress} />
                <span className="qb-toggle-pill" />
                <div>
                  <div className="qb-toggle-text">Deliver back to pickup location</div>
                  <div className="qb-toggle-sub">Use the same address for delivery</div>
                </div>
              </label>
            </div>

            {/* Delivery Address Section (if different) */}
            {!useSameAddress && (
              <div className="qb-sub-section" style={{ marginTop: "24px" }}>
                <h3 className="qb-sub-title"><i className="fas fa-truck" /> Delivery Address</h3>
                {userToken && addresses.length > 0 && !showPickupAddressForm ? (
                  <div className="qb-address-list">
                    {addresses.map((addr) => (
                      <div
                        key={addr.address_id}
                        className={`qb-address-card${selectedPickupAddressId === String(addr.address_id) ? " selected" : ""}`}
                        onClick={() => setSelectedPickupAddressId(String(addr.address_id))}
                      >
                        <div className="qb-address-card-body">
                          <div className="qb-address-card-icon"><i className="fas fa-home" /></div>
                          <div>
                            <div className="qb-address-line">{addr.full_address}</div>
                            <div className="qb-address-pc"><i className="fas fa-map-pin" /> {addr.postcode}</div>
                          </div>
                        </div>
                        {selectedPickupAddressId === String(addr.address_id) && (
                          <div className="qb-check-circle"><i className="fas fa-check" /></div>
                        )}
                      </div>
                    ))}
                    <div className="qb-add-new-card" onClick={() => { setShowPickupAddressForm(true);   setIsDeliveryAddressSaved(false);  // (UI toggle - okay for now)
  setSelectedAddressId("new");    // ✅ THIS FIXES EVERYTHING
}}>
                      <div className="qb-add-icon"><i className="fas fa-plus" /></div>
                      <div><strong>Add New Delivery Address</strong></div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="qb-form-row">
                      <div className="qb-field">
                        <label className="qb-label">Postcode</label>
                        <input
                          type="text"
                          className="qb-input"
                          value={deliveryPostcode}
                          onChange={(e) => setDeliveryPostcode(e.target.value.toUpperCase())}
                          placeholder="SW1A 2AA"
                        />
                      </div>
                      <div className="qb-field">
                        <label className="qb-label">Select Address</label>
                        <select
                          className="qb-select"
                          value={selectedDeliveryPostcodeAddress}
                          onChange={(e) => setSelectedDeliveryPostcodeAddress(e.target.value)}
                        >
                          <option value="">Select address</option>
                          {deliveryPostcodeAddresses.map((addr, idx) => (
                            <option key={idx} value={addr.place_id}>{addr.full}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="qb-field">
                      <label className="qb-label">Address details</label>
                      <input
                        type="text"
                        className="qb-input"
                        placeholder="Flat / Door / Floor"
                        value={deliveryAddressDetails}
                        onChange={(e) => {
                          setDeliveryAddressDetails(e.target.value);
                          setIsDeliveryAddressSaved(false);
                        }}
                      />
                    </div>
                  </div>
                )}
                {userToken && addresses.length > 0 && showPickupAddressForm && (
                  <button className="qb-btn-ghost" onClick={() => { resetManualDeliveryForm(); setShowPickupAddressForm(false); }}>
                    <i className="fas fa-arrow-left" /> Back to Saved Addresses
                  </button>
                )}
              </div>
            )}

            <div className="qb-btn-row">
              <button className="qb-btn-ghost" onClick={() => setStep(1)}>
                <i className="fas fa-arrow-left" /> Back
              </button>
              <button className="qb-btn-primary" onClick={() => setStep(3)} disabled={!stepDone(2)}>
                Continue to Schedule <i className="fas fa-arrow-right" />
              </button>
            </div>
          </div>
        )}

        {/* ════════ STEP 3 — Schedule ════════ */}
        {step === 3 && (
          <div className="qb-section-card">
            <h2 className="qb-section-title">Pick a Time</h2>
            <p className="qb-section-desc">Choose when we collect and when we return your laundry.</p>

            <div className="qb-schedule-grid">
              {/* Collection */}
              <div className="qb-schedule-panel">
                <div className="qb-schedule-panel-label">
                  <span className="qb-panel-dot pickup" />
                  <i className="fas fa-truck-loading" /> Collection
                </div>
                <div className="qb-field">
                  <label className="qb-label">Date</label>
                  <input
                    className="qb-input"
                    type="date"
                    value={collectDate}
                    onChange={handleCollectDateChange}
                    min={today}
                  />
                </div>
                {collectDate && <div className="qb-date-selected-chip"><i className="fas fa-calendar-check" /> {new Date(collectDate).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</div>}
                {collectDate && (
                  <>
                    <div className="qb-slots-label">Available Times</div>
                    {loadingSlots.collect ? (
                      <div className="qb-loading-row"><span className="qb-spin" /> Loading slots…</div>
                    ) : collectSlots.length === 0 ? (
                      <p className="qb-no-slots">This date is fully booked. Please select other day — slots fill up quickly!.</p>
                    ) : (
                      <div className="qb-slots-grid">
                        {collectSlots.map((slot, i) => (
                          <button
                            key={i}
                            className={`qb-slot-btn${selectedCollectSlot?.start === slot.start ? " selected" : ""}${!slot.enabled ? " disabled" : ""}`}
                            onClick={() => handleCollectSlotSelect(slot)}
                            disabled={!slot.enabled}
                          >
                            {formatTimeRange24Hour(slot.start, slot.end)}
                          </button>
                        ))}
                      </div>
                    )}
                    {selectedCollectSlot && (
                      <div className="qb-slot-confirm">
                        <i className="fas fa-check-circle" /> {formatTimeRange24Hour(selectedCollectSlot.start, selectedCollectSlot.end)}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Delivery */}
              <div className="qb-schedule-panel">
                <div className="qb-schedule-panel-label">
                  <span className="qb-panel-dot delivery" />
                  <i className="fas fa-truck" /> Delivery
                </div>
                <div className="qb-field">
                  <label className="qb-label">Date</label>
                  <input
                    className="qb-input"
                    type="date"
                    value={deliverDate}
                    onChange={handleDeliverDateChange}
                    min={minDeliveryDate}
                    disabled={!collectDate}
                  />
                  {!collectDate && <p className="qb-hint-text">Select collection date first</p>}
                </div>
                {deliverDate && <div className="qb-date-selected-chip"><i className="fas fa-calendar-check" /> {new Date(deliverDate).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</div>}
                {deliverDate && (
                  <>
                    <div className="qb-slots-label">Available Times</div>
                    {loadingSlots.deliver ? (
                      <div className="qb-loading-row"><span className="qb-spin" /> Loading slots…</div>
                    ) : deliverSlots.length === 0 ? (
                      <p className="qb-no-slots">This date is fully booked. Please select other day — slots fill up quickly!.</p>
                    ) : (
                      <div className="qb-slots-grid">
                        {deliverSlots.map((slot, i) => (
                          <button
                            key={i}
                            className={`qb-slot-btn${selectedDeliverSlot?.start === slot.start ? " selected" : ""}${!slot.enabled ? " disabled" : ""}`}
                            onClick={() => handleDeliverSlotSelect(slot)}
                            disabled={!slot.enabled}
                          >
                            {formatTimeRange24Hour(slot.start, slot.end)}
                          </button>
                        ))}
                      </div>
                    )}
                    {selectedDeliverSlot && (
                      <div className="qb-slot-confirm">
                        <i className="fas fa-check-circle" /> {formatTimeRange24Hour(selectedDeliverSlot.start, selectedDeliverSlot.end)}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Notes */}
            <div className="qb-field" style={{ marginTop: 18 }}>
              <label className="qb-label">
                Special Instructions <span className="qb-label-opt">(optional)</span>
              </label>
              <div className="qb-notes-wrap">
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={500}
                  placeholder="e.g. ring bell twice, fragile items, leave with neighbour…"
                />
                <div className="qb-notes-footer">
                  <span><i className="fas fa-lightbulb" style={{ color: "var(--qb-accent)", marginRight: 4 }} />Optional but helpful</span>
                  {notes.length > 0 && <span className="qb-char-count">{notes.length}/500</span>}
                </div>
              </div>
            </div>

            <div className="qb-btn-row">
              <button className="qb-btn-ghost" onClick={() => setStep(2)}>
                <i className="fas fa-arrow-left" /> Back
              </button>
              <button className="qb-btn-primary" onClick={() => setStep(4)} disabled={!stepDone(3)}>
                Continue to Payment <i className="fas fa-arrow-right" />
              </button>
            </div>
          </div>
        )}

        {/* ════════ STEP 4 — Payment ════════ */}
        {step === 4 && !showPaymentSetup && (
          <div className="qb-section-card">
            <h2 className="qb-section-title">Payment Method</h2>
            <p className="qb-section-desc">No charge now — you'll only pay after approving your invoice.</p>

            <div className="qb-no-charge-notice">
              <div className="qb-notice-icon"><i className="fas fa-info-circle" /></div>
              <div>
                <strong>No payment taken now.</strong> Save your card to confirm your booking. We'll send an invoice after pickup — you only pay when you're happy.
              </div>
            </div>

            <div className="qb-summary-box">
              <div className="qb-summary-row">
                <span>Collection</span>
                <span>{selectedCollectSlot ? `${new Date(collectDate).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} · ${formatTimeRange24Hour(selectedCollectSlot.start, selectedCollectSlot.end)}` : "—"}</span>
              </div>
              <div className="qb-summary-row">
                <span>Delivery</span>
                <span>{selectedDeliverSlot ? `${new Date(deliverDate).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} · ${formatTimeRange24Hour(selectedDeliverSlot.start, selectedDeliverSlot.end)}` : "—"}</span>
              </div>
              <div className="qb-summary-row">
                <span>Total (inc. fees)</span>
                <span>£{total.toFixed(2)}</span>
              </div>
            </div>

            {userToken && loadingCards ? (
              <div className="qb-loading-cards">
                <span className="qb-spin" /> Loading your saved cards…
              </div>
            ) : userToken && savedCards.length > 0 ? (
              <>
                <p className="qb-cards-heading"><i className="fas fa-credit-card" style={{ marginRight: 6 }} />Your Saved Cards</p>
                <div className="qb-saved-cards-list">
                  {savedCards.map((card) => (
                    <div
                      key={card.payment_method_id}
                      className={`qb-card-item${selectedCard === card.payment_method_id ? " selected" : ""}`}
                      onClick={() => setSelectedCard(card.payment_method_id)}
                    >
                      <i className={getCardBrandIcon(card.brand)} style={{ fontSize: "1.4rem", color: "var(--qb-text-secondary)" }} />
                      <span className="qb-card-brand-text">{card.brand?.toUpperCase() || "CARD"}</span>
                      <span className="qb-card-num">•••• {card.last4}</span>
                      {card.is_default && <span className="qb-card-default-badge"><i className="fas fa-check-circle" /> Default</span>}
                      {selectedCard === card.payment_method_id && <div className="qb-check-circle"><i className="fas fa-check" /></div>}
                      <button className="qb-card-del" onClick={(e) => { e.stopPropagation(); handleDeleteCard(card.payment_method_id); }}>
                        <i className="fas fa-trash" />
                      </button>
                    </div>
                  ))}
                  <div className="qb-add-card-btn" onClick={handleUseAnotherCard}>
                    <div className="qb-add-icon"><i className="fas fa-plus" /></div>
                    <span>Use a different card</span>
                  </div>
                </div>
                <button
                  className="qb-btn-primary lg"
                  onClick={handleSavedCardBooking}
                  disabled={!isBookingValid() || loading || setupProcessing || bookingInProgress}
                >
                  {loading ? <><div className="qb-btn-spinner" /> Processing…</> : <><i className="fas fa-check-circle" /> Confirm Booking</>}
                </button>
              </>
            ) : (
              <>
                {/* <label className="qb-save-toggle-row">
  <div className="qb-save-toggle-icon">
    <i className="fas fa-lock" />
  </div>
 
  <div className="qb-save-toggle-text">
    <strong>Reserve My Slot</strong>
    <span>
      Enter your card details to secure your booking.
      No charges will be made until after inspection.
    </span>
  </div>
 
  <label className="qb-switch">
    <input
      type="checkbox"
      checked={saveCardOption}
      onChange={(e) => setSaveCardOption(e.target.checked)}
    />
    <span className="qb-switch-slider" />
  </label>
</label> */}
                <button
                  className="qb-btn-primary lg"
                  onClick={() => handleConfirmBooking()}
                  disabled={!isBookingValid() || loading || setupProcessing || bookingInProgress}
                >
                  {loading || setupProcessing
                    ? <><div className="qb-btn-spinner" /> Processing…</>
                    : <><i className="fas fa-lock" /> {saveCardOption ? "Book Now " : "Book Now"}</>}
                </button>
              </>
            )}

            <button className="qb-btn-ghost" onClick={() => navigate("/")} disabled={loading || setupProcessing}>
              <i className="fas fa-times" /> Cancel Booking
            </button>

            <div className="qb-trust-row">
              <span><i className="fas fa-check" />Free collection</span>
              <span><i className="fas fa-check" />24hr turnaround</span>
              <span><i className="fas fa-check" />Pay after inspection</span>
            </div>

            <div className="qb-btn-row" style={{ marginTop: 10 }}>
              <button className="qb-btn-ghost" onClick={() => setStep(3)}>
                <i className="fas fa-arrow-left" /> Back
              </button>
            </div>
          </div>
        )}

      </main>

      {/* Stripe Modal */}
      {showPaymentSetup && (
        <Elements
          stripe={stripePromise}
          options={{
            clientSecret: setupClientSecret || paymentClientSecret,
            appearance: { theme: "stripe" },
          }}
        >
          <StripeSetupForm
            onSetupSuccess={handleSetupSuccess}
            onSetupError={handleSetupError}
            onCancel={handlePaymentModalCancel}
            setupProcessing={setupProcessing}
            userToken={userToken}
            isSetup={!!setupClientSecret}
          />
        </Elements>
      )}

      {/* Toast */}
      {toast && (
        <div className={`qb-toast qb-toast-${toast.type}`}>
          <div className="qb-toast-icon">
            {toast.type === "success" ? <i className="fas fa-check-circle" />
              : toast.type === "error" ? <i className="fas fa-exclamation-circle" />
              : toast.type === "warning" ? <i className="fas fa-exclamation-triangle" />
              : <i className="fas fa-info-circle" />}
          </div>
          <div className="qb-toast-message">{toast.msg}</div>
          <button className="qb-toast-close" onClick={() => setToast(null)}>
            <i className="fas fa-times" />
          </button>
        </div>
      )}
    </div>
  );
}
