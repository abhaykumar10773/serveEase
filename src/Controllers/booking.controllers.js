import { Booking } from "../models/booking.model.js";
import { User } from "../models/user.model.js"; // Assuming you have a User model
import { Service } from "../models/service.model.js"; // Assuming you have a Service model
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import axios from "axios";
import {io} from "../app.js";


// Step 1: Search Providers in the Area

// Geocoding function using HERE Maps
// const getCoordinatesFromLocation = async (locationName,city) => {
//   const hereApiKey = "74sDSdKcPruzGToHytQmhNHCSZ-3AJA_OGtH9KjNMTc"; // Replace with your HERE Maps API key
//   const query = `${locationName}, ${city}`;
//   const geocodingURL = `https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(
//     query
//   )}&apikey=${hereApiKey}`;

//   const response = await axios.get(geocodingURL);

//   if (response.data.items && response.data.items.length > 0) {
//     const { lat, lng } = response.data.items[0].position;
//     return { latitude: lat, longitude: lng };
//   } else {
//     throw new ApiError(401, "Unable to get coordinates for the given location.");
//   }
// };

const getCoordinatesFromLocation = async (locationName, city) => {
  const query = `${locationName}, ${city}`;

  const geocodingURL =
    `https://geocode.search.hereapi.com/v1/geocode` +
    `?q=${encodeURIComponent(query)}` +
    `&apiKey=${process.env.HERE_API_KEY}`;

  const response = await axios.get(geocodingURL);

  if (
    response.data &&
    response.data.items &&
    response.data.items.length > 0
  ) {
    const position = response.data.items[0].position;

    return {
      latitude: position.lat,
      longitude: position.lng,
    };
  }

  throw new Error(
    "Unable to get coordinates for the given location."
  );
};

// 2nd task  
// const getCoordinatesFromLocation = async (locationName, city) => {
//   const query = `${locationName}, ${city}`;
//   const geocodingURL = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
//     query
//   )}&format=json&limit=1`;

//   // IMPORTANT: User-Agent dena mandatory hai Nominatim ke liye
//   const response = await axios.get(geocodingURL, {
//     headers: {
//       "User-Agent": "serveease-app/1.0 (test@example.com)"
//     }
//   });

//   if (response.data && response.data.length > 0) {
//     const { lat, lon } = response.data[0];
//     return { latitude: parseFloat(lat), longitude: parseFloat(lon) };
//   } else {
//     throw new Error("Unable to get coordinates for the given location.");
//   }
// };



// @desc    Search All Service Providers in Area
// @route   POST /api/services/search
// @access  Public
const searchServiceProviders = asyncHandler(async (req, res) => {
  const { locationName, houseNo, category, city } = req.body;

  if (!locationName || !houseNo || !category || !city) {
    res.status(400);
    throw new ApiError(400, "Please provide locationName, houseNo, category, and city.");
  }

  // Convert location name to coordinates
  // const { latitude, longitude } = await getCoordinatesFromLocation(locationName, city);


  const { latitude, longitude } = await getCoordinatesFromLocation(locationName, city).catch(err => {
    console.error("Geocoding error:", err.message);
    return { latitude: null, longitude: null };
});

if (!latitude || !longitude) {
    res.status(404);
    throw new Error("Unable to find coordinates for this location. Try more specific address.");
}

console.log("lat long",latitude,longitude);
  // Fetch services with provider details
  const services = await Service.find({
    category, // Use the category from the request
    serviceArea: {
      $near: {
        $geometry: {
          type: "Point",
          coordinates: [longitude, latitude],
        },
        $maxDistance: 15000, // Adjust distance as needed
      },
    },
  }).populate("provider", "FullName contact email profileimg address"); 
 
  // sirf in fields ko response me layega
console.log("ssss",services);
  if (services.length === 0) {
    res.status(404);
    throw new Error("No service providers found for the specified category in this location.");
  }

  res.status(200).json({
    message: `Service providers found for category: ${category}`,
    data: services,
    locationName,
  });
});


// Step 2: Select Shift, Date, and Provider
// this is enhance version of booking which we add at last 
export const selectProviderAndTime = async (req, res) => {
    const { customerId, providerId, serviceId, date, shift } = req.body;

    try {
        // Check if the provider is available on the selected date and shift
        const existingBooking = await Booking.findOne({ provider: providerId, date, shift });
        if (existingBooking) {
            return res.status(400).json({ message: "The provider is unavailable for the selected date and shift." });
        }

        res.status(200).json({ message: "Provider is available." });
    } catch (error) {
        res.status(500).json({ error: "Error selecting provider and time." });
    }
};

// Step 3: Confirm Booking
const Bookprovider = async (req, res) => {
  try {
    const { customer, provider, service, date, shift, houseNo, description, area, city, status } = req.body;

    if (!customer || !provider || !service || !date || !shift || !houseNo || !city) {
      console.log("Missing fields:", { customer, provider, service, date, shift, houseNo, area, city });
      return res.status(400).json({ error: "Please provide all required fields." });
    }

    const newBooking = await Booking.create({
      customer: customer,
      provider: provider,
      service: service,
      date,
      shift,
      address: { houseNo, area, city },
      description,
      status: status || "Pending"
    });

    console.log("newBooking", newBooking);

    io.emit("sendBooking", { provider, booking: newBooking });

    return res.status(201).json({
      status: 200,
      data: newBooking,
      message: "Booking confirmed successfully"
    });
  } catch (error) {
    console.error("Error confirming booking:", error);
    res.status(500).json({ error: "Error confirming the booking." });
  }
};
  const AcceptBooking = async (req, res) => {
    const { _id } = req.body;
try{
         console.log("BookingId",_id);
  const existingBooking = await Booking.findById(_id);
        if (!existingBooking) {
             return res.status(404).json({ error: "Booking not found." });
       }
    const booking = await Booking.findByIdAndUpdate(
         _id,{ 
      $set:{
        status: "Confirm"
        }
      },
        { new: true }
    );

    // Emit event to notify the user in real-time
    io.to(booking).emit("bookingAccepted", {
      _id: _id, // Ensure the frontend gets _id
      status: "Confirm",
  });
           return res
           .status(200)
           .json(
             new ApiResponse(200,booking,"Booking accepted. ")
           )
    } catch (error) {
      console.log("Error accepting booking:", error);
        res.status(500).json({ error: "Error accepting the booking." });
    }
  };

  const CompleteBooking = async (req, res) => {
    const { _id } = req.body;
try{
 console.log("BookingId",_id);
  const existingBooking = await Booking.findById(_id);
if (!existingBooking) {
  return res.status(404).json({ error: "Booking not found." });
}
    const booking = await Booking.findByIdAndUpdate(
         _id,{ 
      $set:{
        status: "Completed"
        }
      },
        { new: true }
    );

    // Emit event to notify the user in real-time
    io.to(booking).emit("completeBooking", {
      _id: _id, // Ensure the frontend gets _id
      status: "Completed",
  });
           return res
           .status(200)
           .json(
             new ApiResponse(200,booking,"Booking accepted. ")
           )
    } catch (error) {
      console.log("Error accepting booking:", error);
        res.status(500).json({ error: "Error accepting the booking." });
    }
  };

  const RejectBooking = async(req,res) => {
    
  }

  const getAllUserBookings = asyncHandler(async (req, res) => {

    console.log("Fetching bookings for user:", req.users?._id);

      const booking = await Booking.find({customer:req.users?._id}).populate("service provider customer");
       
      if(!booking){
        return new ApiError(404,"No booking found for this user") 
      }
      console.log("booking",booking);
     return res.status(200)
      .json(
        new ApiResponse(200,booking,"All bookings fetched successfully")
      )

  });

  const getAllProviderBookings = asyncHandler(async (req, res) => {
     console.log("Fetching bookings for provider:", req.users?._id);
    try {
         const booking = await Booking.find({provider:req.users?._id}).populate("service provider customer");
         if(!booking){
          return new ApiError(404,"No booking found for this provider");
         }
         console.log("booking",booking);

         return res.status(200)
         .json(
          new ApiResponse(200,booking,"All bookings fetched successfully")
         )
    } catch (error) {
       console.log("Error fetching bookings:", error);
    }
  });
export {
  searchServiceProviders,
  Bookprovider,
  getAllUserBookings,
  getAllProviderBookings,
  AcceptBooking,
  RejectBooking,
  CompleteBooking,
  getCoordinatesFromLocation
}
