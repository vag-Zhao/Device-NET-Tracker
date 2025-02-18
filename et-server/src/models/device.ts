import mongoose, { Schema, Document } from 'mongoose';

export interface IDevice extends Document {
  serialNumber: string;
  networkInfo: any;
  platform: string;
  lastSeen: Date;
  isOnline: boolean;
}

const DeviceSchema: Schema = new Schema({
  serialNumber: { 
    type: String, 
    required: true, 
    unique: true 
  },
  networkInfo: { 
    type: Schema.Types.Mixed 
  },
  platform: { 
    type: String 
  },
  lastSeen: { 
    type: Date, 
    default: Date.now 
  },
  isOnline: { 
    type: Boolean, 
    default: true 
  }
}, {
  timestamps: true
});

export default mongoose.model<IDevice>('Device', DeviceSchema);