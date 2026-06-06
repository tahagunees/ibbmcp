import axios from 'axios';

export interface TransitStep {
  mode: 'WALKING' | 'TRANSIT' | string;
  instruction: string;
  lineName?: string;
  vehicleType?: string;
  departureStop?: string;
  arrivalStop?: string;
  numStops?: number;
  durationText?: string;
}

export interface TransitPlan {
  summary?: string;
  durationText?: string;
  distanceText?: string;
  steps: TransitStep[];
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function getGoogleTransitPlan(params: {
  origin: string;
  destination: string;
  apiKey: string;
}): Promise<TransitPlan> {
  const { data } = await axios.get(
    'https://maps.googleapis.com/maps/api/directions/json',
    {
      params: {
        origin: params.origin,
        destination: params.destination,
        mode: 'transit',
        language: 'tr',
        region: 'tr',
        departure_time: 'now',
        key: params.apiKey,
      },
      timeout: 15000,
    }
  );

  if (data?.status !== 'OK') {
    const message = data?.error_message
      ? `${data.status}: ${data.error_message}`
      : `Directions API status: ${data?.status ?? 'UNKNOWN'}`;
    throw new Error(message);
  }

  const route = data.routes?.[0];
  const leg = route?.legs?.[0];
  const rawSteps = leg?.steps ?? [];

  const steps: TransitStep[] = rawSteps.map((s: any) => {
    const td = s.transit_details;
    return {
      mode: s.travel_mode,
      instruction: stripHtml(s.html_instructions ?? ''),
      lineName: td?.line?.short_name ?? td?.line?.name,
      vehicleType: td?.line?.vehicle?.name,
      departureStop: td?.departure_stop?.name,
      arrivalStop: td?.arrival_stop?.name,
      numStops: td?.num_stops,
      durationText: s.duration?.text,
    };
  });

  return {
    summary: route?.summary,
    durationText: leg?.duration?.text,
    distanceText: leg?.distance?.text,
    steps,
  };
}
