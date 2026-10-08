'use client';

import { type Functions, getFunctions } from 'firebase/functions';
import { firebaseApp } from './client';

export const functions: Functions = getFunctions(firebaseApp, 'europe-west3');
