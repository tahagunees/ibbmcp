import axios from 'axios';

export interface IsparkPark {
  parkID: number;
  parkName: string;
  lat: string;
  lng: string;
  capacity: number;
  emptyCapacity: number;
  workHours: string;
  parkType: string;
  freeTime: number;
  district: string;
  isOpen: number;
}

export interface IsparkParkDetail extends IsparkPark {
  updateDate?: string;
  monthlyFee?: number;
  tariff?: string;
  address?: string;
  locationName?: string;
  areaPolygon?: string;
}

const isparkClient = axios.create({
  baseURL: 'https://api.ibb.gov.tr/ispark',
  timeout: 15000,
});

export async function getIsparkParks(): Promise<IsparkPark[]> {
  const { data } = await isparkClient.get<IsparkPark[]>('/Park');
  return Array.isArray(data) ? data : [];
}

export async function getIsparkParkDetail(parkId: number): Promise<IsparkParkDetail[]> {
  const { data } = await isparkClient.get<IsparkParkDetail[]>('/ParkDetay', {
    params: { id: parkId },
  });
  return Array.isArray(data) ? data : [];
}
