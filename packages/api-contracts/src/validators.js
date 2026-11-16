// Generated from openapi/root.yaml. DO NOT EDIT.
import formatsModule from "ajv-formats/dist/formats.js";
const formats = formatsModule.fullFormats;
import helper0 from "ajv/dist/runtime/ucs2length.js";
"use strict";
export const schema_Identifier = validate20;
const schema31 = {"$id":"schema_Identifier","type":"string","minLength":1,"description":"Opaque case-sensitive resource identifier; never parse for authority."};
const func1 = helper0.default;

function validate20(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_Identifier" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate20.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(typeof data === "string"){
if(func1(data) < 1){
const err0 = {instancePath,schemaPath:"#/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
}
else {
const err1 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
validate20.errors = vErrors;
return errors === 0;
}
validate20.evaluated = {"dynamicProps":false,"dynamicItems":false};

export const schema_Timestamp = validate21;
const schema32 = {"$id":"schema_Timestamp","type":"string","format":"date-time"};
const formats0 = formats["date-time"];

function validate21(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_Timestamp" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate21.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(typeof data === "string"){
if(!(formats0.validate(data))){
const err0 = {instancePath,schemaPath:"#/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
}
else {
const err1 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
validate21.errors = vErrors;
return errors === 0;
}
validate21.evaluated = {"dynamicProps":false,"dynamicItems":false};

export const schema_ListMeta = validate22;
const schema33 = {"$id":"schema_ListMeta","type":"object","additionalProperties":false,"properties":{"total":{"type":"integer","minimum":0}},"required":["total"]};

function validate22(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_ListMeta" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate22.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.total === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "total"},message:"must have required property '"+"total"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
for(const key0 in data){
if(!(key0 === "total")){
const err1 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
if(data.total !== undefined){
let data0 = data.total;
if(!((typeof data0 == "number") && (!(data0 % 1) && !isNaN(data0)))){
const err2 = {instancePath:instancePath+"/total",schemaPath:"#/properties/total/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(typeof data0 == "number"){
if(data0 < 0 || isNaN(data0)){
const err3 = {instancePath:instancePath+"/total",schemaPath:"#/properties/total/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
}
}
else {
const err4 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
validate22.errors = vErrors;
return errors === 0;
}
validate22.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_LegacyError = validate23;
const schema34 = {"$id":"schema_LegacyError","type":"object","additionalProperties":false,"properties":{"success":{"const":false},"error":{"type":"object","additionalProperties":false,"properties":{"code":{"type":"string"},"message":{"type":"string"},"details":{"type":"array","items":{"type":"object","additionalProperties":false,"properties":{"field":{"type":"string"},"message":{"type":"string"},"code":{"type":"string"}},"required":["field","message","code"]}}},"required":["code","message"]}},"required":["success","error"]};

function validate23(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_LegacyError" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate23.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.success === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "success"},message:"must have required property '"+"success"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.error === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "error"},message:"must have required property '"+"error"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "success") || (key0 === "error"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.success !== undefined){
if(false !== data.success){
const err3 = {instancePath:instancePath+"/success",schemaPath:"#/properties/success/const",keyword:"const",params:{allowedValue: false},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.error !== undefined){
let data1 = data.error;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.code === undefined){
const err4 = {instancePath:instancePath+"/error",schemaPath:"#/properties/error/required",keyword:"required",params:{missingProperty: "code"},message:"must have required property '"+"code"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data1.message === undefined){
const err5 = {instancePath:instancePath+"/error",schemaPath:"#/properties/error/required",keyword:"required",params:{missingProperty: "message"},message:"must have required property '"+"message"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
for(const key1 in data1){
if(!(((key1 === "code") || (key1 === "message")) || (key1 === "details"))){
const err6 = {instancePath:instancePath+"/error",schemaPath:"#/properties/error/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data1.code !== undefined){
if(typeof data1.code !== "string"){
const err7 = {instancePath:instancePath+"/error/code",schemaPath:"#/properties/error/properties/code/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data1.message !== undefined){
if(typeof data1.message !== "string"){
const err8 = {instancePath:instancePath+"/error/message",schemaPath:"#/properties/error/properties/message/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data1.details !== undefined){
let data4 = data1.details;
if(Array.isArray(data4)){
const len0 = data4.length;
for(let i0=0; i0<len0; i0++){
let data5 = data4[i0];
if(data5 && typeof data5 == "object" && !Array.isArray(data5)){
if(data5.field === undefined){
const err9 = {instancePath:instancePath+"/error/details/" + i0,schemaPath:"#/properties/error/properties/details/items/required",keyword:"required",params:{missingProperty: "field"},message:"must have required property '"+"field"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(data5.message === undefined){
const err10 = {instancePath:instancePath+"/error/details/" + i0,schemaPath:"#/properties/error/properties/details/items/required",keyword:"required",params:{missingProperty: "message"},message:"must have required property '"+"message"+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(data5.code === undefined){
const err11 = {instancePath:instancePath+"/error/details/" + i0,schemaPath:"#/properties/error/properties/details/items/required",keyword:"required",params:{missingProperty: "code"},message:"must have required property '"+"code"+"'"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
for(const key2 in data5){
if(!(((key2 === "field") || (key2 === "message")) || (key2 === "code"))){
const err12 = {instancePath:instancePath+"/error/details/" + i0,schemaPath:"#/properties/error/properties/details/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data5.field !== undefined){
if(typeof data5.field !== "string"){
const err13 = {instancePath:instancePath+"/error/details/" + i0+"/field",schemaPath:"#/properties/error/properties/details/items/properties/field/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data5.message !== undefined){
if(typeof data5.message !== "string"){
const err14 = {instancePath:instancePath+"/error/details/" + i0+"/message",schemaPath:"#/properties/error/properties/details/items/properties/message/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data5.code !== undefined){
if(typeof data5.code !== "string"){
const err15 = {instancePath:instancePath+"/error/details/" + i0+"/code",schemaPath:"#/properties/error/properties/details/items/properties/code/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
}
else {
const err16 = {instancePath:instancePath+"/error/details/" + i0,schemaPath:"#/properties/error/properties/details/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
}
else {
const err17 = {instancePath:instancePath+"/error/details",schemaPath:"#/properties/error/properties/details/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
}
else {
const err18 = {instancePath:instancePath+"/error",schemaPath:"#/properties/error/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
}
else {
const err19 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
validate23.errors = vErrors;
return errors === 0;
}
validate23.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_SimpleError = validate24;
const schema35 = {"$id":"schema_SimpleError","type":"object","additionalProperties":false,"properties":{"error":{"type":"string"}},"required":["error"]};

function validate24(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_SimpleError" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate24.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.error === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "error"},message:"must have required property '"+"error"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
for(const key0 in data){
if(!(key0 === "error")){
const err1 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
if(data.error !== undefined){
if(typeof data.error !== "string"){
const err2 = {instancePath:instancePath+"/error",schemaPath:"#/properties/error/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
}
else {
const err3 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
validate24.errors = vErrors;
return errors === 0;
}
validate24.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_Problem = validate25;
const schema36 = {"$id":"schema_Problem","type":"object","additionalProperties":false,"properties":{"type":{"type":"string","format":"uri-reference"},"title":{"type":"string"},"status":{"type":"integer","minimum":400,"maximum":599},"detail":{"type":"string"},"instance":{"type":"string","format":"uri-reference"},"errors":{"type":"array","items":{"type":"object","additionalProperties":false,"properties":{"field":{"type":"string"},"message":{"type":"string"},"code":{"type":"string"}},"required":["field","message","code"]}}},"required":["type","title","status"]};
const formats2 = /^(?:[a-z][a-z0-9+\-.]*:)?(?:\/?\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:){0,1}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)|[Vv][0-9a-f]+\.[a-z0-9\-._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-z0-9\-._~!$&'"()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*)?(?:\?(?:[a-z0-9\-._~!$&'"()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[a-z0-9\-._~!$&'"()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i;

function validate25(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_Problem" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate25.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.type === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.title === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.status === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
for(const key0 in data){
if(!((((((key0 === "type") || (key0 === "title")) || (key0 === "status")) || (key0 === "detail")) || (key0 === "instance")) || (key0 === "errors"))){
const err3 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.type !== undefined){
let data0 = data.type;
if(typeof data0 === "string"){
if(!(formats2.test(data0))){
const err4 = {instancePath:instancePath+"/type",schemaPath:"#/properties/type/format",keyword:"format",params:{format: "uri-reference"},message:"must match format \""+"uri-reference"+"\""};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
else {
const err5 = {instancePath:instancePath+"/type",schemaPath:"#/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.title !== undefined){
if(typeof data.title !== "string"){
const err6 = {instancePath:instancePath+"/title",schemaPath:"#/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.status !== undefined){
let data2 = data.status;
if(!((typeof data2 == "number") && (!(data2 % 1) && !isNaN(data2)))){
const err7 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(typeof data2 == "number"){
if(data2 > 599 || isNaN(data2)){
const err8 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/maximum",keyword:"maximum",params:{comparison: "<=", limit: 599},message:"must be <= 599"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(data2 < 400 || isNaN(data2)){
const err9 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/minimum",keyword:"minimum",params:{comparison: ">=", limit: 400},message:"must be >= 400"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
}
if(data.detail !== undefined){
if(typeof data.detail !== "string"){
const err10 = {instancePath:instancePath+"/detail",schemaPath:"#/properties/detail/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.instance !== undefined){
let data4 = data.instance;
if(typeof data4 === "string"){
if(!(formats2.test(data4))){
const err11 = {instancePath:instancePath+"/instance",schemaPath:"#/properties/instance/format",keyword:"format",params:{format: "uri-reference"},message:"must match format \""+"uri-reference"+"\""};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
else {
const err12 = {instancePath:instancePath+"/instance",schemaPath:"#/properties/instance/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.errors !== undefined){
let data5 = data.errors;
if(Array.isArray(data5)){
const len0 = data5.length;
for(let i0=0; i0<len0; i0++){
let data6 = data5[i0];
if(data6 && typeof data6 == "object" && !Array.isArray(data6)){
if(data6.field === undefined){
const err13 = {instancePath:instancePath+"/errors/" + i0,schemaPath:"#/properties/errors/items/required",keyword:"required",params:{missingProperty: "field"},message:"must have required property '"+"field"+"'"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(data6.message === undefined){
const err14 = {instancePath:instancePath+"/errors/" + i0,schemaPath:"#/properties/errors/items/required",keyword:"required",params:{missingProperty: "message"},message:"must have required property '"+"message"+"'"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(data6.code === undefined){
const err15 = {instancePath:instancePath+"/errors/" + i0,schemaPath:"#/properties/errors/items/required",keyword:"required",params:{missingProperty: "code"},message:"must have required property '"+"code"+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
for(const key1 in data6){
if(!(((key1 === "field") || (key1 === "message")) || (key1 === "code"))){
const err16 = {instancePath:instancePath+"/errors/" + i0,schemaPath:"#/properties/errors/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data6.field !== undefined){
if(typeof data6.field !== "string"){
const err17 = {instancePath:instancePath+"/errors/" + i0+"/field",schemaPath:"#/properties/errors/items/properties/field/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data6.message !== undefined){
if(typeof data6.message !== "string"){
const err18 = {instancePath:instancePath+"/errors/" + i0+"/message",schemaPath:"#/properties/errors/items/properties/message/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data6.code !== undefined){
if(typeof data6.code !== "string"){
const err19 = {instancePath:instancePath+"/errors/" + i0+"/code",schemaPath:"#/properties/errors/items/properties/code/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
}
else {
const err20 = {instancePath:instancePath+"/errors/" + i0,schemaPath:"#/properties/errors/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
}
else {
const err21 = {instancePath:instancePath+"/errors",schemaPath:"#/properties/errors/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
}
else {
const err22 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
validate25.errors = vErrors;
return errors === 0;
}
validate25.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_User = validate26;
const schema37 = {"$id":"schema_User","type":"object","additionalProperties":false,"properties":{"id":{"$ref":"gamo#/components/schemas/Identifier"},"email":{"type":"string","format":"email"},"displayName":{"anyOf":[{"type":"string"},{"type":"null"}]},"verifiedEmailAt":{"anyOf":[{"$ref":"gamo#/components/schemas/Timestamp"},{"type":"null"}]},"status":{"type":"string"},"createdAt":{"$ref":"gamo#/components/schemas/Timestamp"}},"required":["id","email","displayName","verifiedEmailAt","status","createdAt"]};
const schema39 = {"type":"string","minLength":1,"description":"Opaque case-sensitive resource identifier; never parse for authority."};
const schema40 = {"type":"string","format":"date-time"};
const formats6 = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;

function validate26(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_User" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate26.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.email === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "email"},message:"must have required property '"+"email"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.displayName === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "displayName"},message:"must have required property '"+"displayName"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.verifiedEmailAt === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "verifiedEmailAt"},message:"must have required property '"+"verifiedEmailAt"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.status === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.createdAt === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "createdAt"},message:"must have required property '"+"createdAt"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
for(const key0 in data){
if(!((((((key0 === "id") || (key0 === "email")) || (key0 === "displayName")) || (key0 === "verifiedEmailAt")) || (key0 === "status")) || (key0 === "createdAt"))){
const err6 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.id !== undefined){
let data0 = data.id;
if(typeof data0 === "string"){
if(func1(data0) < 1){
const err7 = {instancePath:instancePath+"/id",schemaPath:"gamo#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/id",schemaPath:"gamo#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.email !== undefined){
let data1 = data.email;
if(typeof data1 === "string"){
if(!(formats6.test(data1))){
const err9 = {instancePath:instancePath+"/email",schemaPath:"#/properties/email/format",keyword:"format",params:{format: "email"},message:"must match format \""+"email"+"\""};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/email",schemaPath:"#/properties/email/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.displayName !== undefined){
let data2 = data.displayName;
const _errs8 = errors;
let valid2 = false;
const _errs9 = errors;
if(typeof data2 !== "string"){
const err11 = {instancePath:instancePath+"/displayName",schemaPath:"#/properties/displayName/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
var _valid0 = _errs9 === errors;
valid2 = valid2 || _valid0;
const _errs11 = errors;
if(data2 !== null){
const err12 = {instancePath:instancePath+"/displayName",schemaPath:"#/properties/displayName/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
var _valid0 = _errs11 === errors;
valid2 = valid2 || _valid0;
if(!valid2){
const err13 = {instancePath:instancePath+"/displayName",schemaPath:"#/properties/displayName/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
else {
errors = _errs8;
if(vErrors !== null){
if(_errs8){
vErrors.length = _errs8;
}
else {
vErrors = null;
}
}
}
}
if(data.verifiedEmailAt !== undefined){
let data3 = data.verifiedEmailAt;
const _errs14 = errors;
let valid3 = false;
const _errs15 = errors;
if(typeof data3 === "string"){
if(!(formats0.validate(data3))){
const err14 = {instancePath:instancePath+"/verifiedEmailAt",schemaPath:"gamo#/components/schemas/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
else {
const err15 = {instancePath:instancePath+"/verifiedEmailAt",schemaPath:"gamo#/components/schemas/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
var _valid1 = _errs15 === errors;
valid3 = valid3 || _valid1;
const _errs18 = errors;
if(data3 !== null){
const err16 = {instancePath:instancePath+"/verifiedEmailAt",schemaPath:"#/properties/verifiedEmailAt/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
var _valid1 = _errs18 === errors;
valid3 = valid3 || _valid1;
if(!valid3){
const err17 = {instancePath:instancePath+"/verifiedEmailAt",schemaPath:"#/properties/verifiedEmailAt/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
else {
errors = _errs14;
if(vErrors !== null){
if(_errs14){
vErrors.length = _errs14;
}
else {
vErrors = null;
}
}
}
}
if(data.status !== undefined){
if(typeof data.status !== "string"){
const err18 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.createdAt !== undefined){
let data5 = data.createdAt;
if(typeof data5 === "string"){
if(!(formats0.validate(data5))){
const err19 = {instancePath:instancePath+"/createdAt",schemaPath:"gamo#/components/schemas/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
else {
const err20 = {instancePath:instancePath+"/createdAt",schemaPath:"gamo#/components/schemas/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
}
else {
const err21 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
validate26.errors = vErrors;
return errors === 0;
}
validate26.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_ProvisionStaffInput = validate28;
const schema42 = {"$id":"schema_ProvisionStaffInput","type":"object","additionalProperties":false,"properties":{"email":{"type":"string","format":"email","minLength":3,"maxLength":254},"role":{"type":"string","enum":["staff_reviewer","finance_manager","superadmin"]},"accessSubject":{"type":"string","minLength":1,"maxLength":255},"displayName":{"type":"string","minLength":1,"maxLength":120}},"required":["email","role","accessSubject"]};

function validate28(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_ProvisionStaffInput" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate28.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.email === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "email"},message:"must have required property '"+"email"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.role === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "role"},message:"must have required property '"+"role"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.accessSubject === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "accessSubject"},message:"must have required property '"+"accessSubject"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
for(const key0 in data){
if(!((((key0 === "email") || (key0 === "role")) || (key0 === "accessSubject")) || (key0 === "displayName"))){
const err3 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.email !== undefined){
let data0 = data.email;
if(typeof data0 === "string"){
if(func1(data0) > 254){
const err4 = {instancePath:instancePath+"/email",schemaPath:"#/properties/email/maxLength",keyword:"maxLength",params:{limit: 254},message:"must NOT have more than 254 characters"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(func1(data0) < 3){
const err5 = {instancePath:instancePath+"/email",schemaPath:"#/properties/email/minLength",keyword:"minLength",params:{limit: 3},message:"must NOT have fewer than 3 characters"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(!(formats6.test(data0))){
const err6 = {instancePath:instancePath+"/email",schemaPath:"#/properties/email/format",keyword:"format",params:{format: "email"},message:"must match format \""+"email"+"\""};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
else {
const err7 = {instancePath:instancePath+"/email",schemaPath:"#/properties/email/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.role !== undefined){
let data1 = data.role;
if(typeof data1 !== "string"){
const err8 = {instancePath:instancePath+"/role",schemaPath:"#/properties/role/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(!(((data1 === "staff_reviewer") || (data1 === "finance_manager")) || (data1 === "superadmin"))){
const err9 = {instancePath:instancePath+"/role",schemaPath:"#/properties/role/enum",keyword:"enum",params:{allowedValues: schema42.properties.role.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.accessSubject !== undefined){
let data2 = data.accessSubject;
if(typeof data2 === "string"){
if(func1(data2) > 255){
const err10 = {instancePath:instancePath+"/accessSubject",schemaPath:"#/properties/accessSubject/maxLength",keyword:"maxLength",params:{limit: 255},message:"must NOT have more than 255 characters"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(func1(data2) < 1){
const err11 = {instancePath:instancePath+"/accessSubject",schemaPath:"#/properties/accessSubject/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
else {
const err12 = {instancePath:instancePath+"/accessSubject",schemaPath:"#/properties/accessSubject/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.displayName !== undefined){
let data3 = data.displayName;
if(typeof data3 === "string"){
if(func1(data3) > 120){
const err13 = {instancePath:instancePath+"/displayName",schemaPath:"#/properties/displayName/maxLength",keyword:"maxLength",params:{limit: 120},message:"must NOT have more than 120 characters"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(func1(data3) < 1){
const err14 = {instancePath:instancePath+"/displayName",schemaPath:"#/properties/displayName/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
else {
const err15 = {instancePath:instancePath+"/displayName",schemaPath:"#/properties/displayName/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
}
else {
const err16 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
validate28.errors = vErrors;
return errors === 0;
}
validate28.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_ProvisionStaffResponse = validate29;
const schema43 = {"$id":"schema_ProvisionStaffResponse","type":"object","additionalProperties":false,"properties":{"success":{"const":true},"data":{"type":"object","additionalProperties":false,"properties":{"user":{"$ref":"gamo#/components/schemas/User"},"role":{"type":"string","enum":["staff_reviewer","finance_manager","superadmin"]},"provider":{"type":"string","const":"cloudflare_access"},"accessSubject":{"type":"string"},"message":{"type":"string"}},"required":["user","role","provider","accessSubject","message"]}},"required":["success","data"]};
const schema44 = {"type":"object","additionalProperties":false,"properties":{"id":{"$ref":"#/components/schemas/Identifier"},"email":{"type":"string","format":"email"},"displayName":{"anyOf":[{"type":"string"},{"type":"null"}]},"verifiedEmailAt":{"anyOf":[{"$ref":"#/components/schemas/Timestamp"},{"type":"null"}]},"status":{"type":"string"},"createdAt":{"$ref":"#/components/schemas/Timestamp"}},"required":["id","email","displayName","verifiedEmailAt","status","createdAt"]};

function validate30(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate30.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.email === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "email"},message:"must have required property '"+"email"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.displayName === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "displayName"},message:"must have required property '"+"displayName"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.verifiedEmailAt === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "verifiedEmailAt"},message:"must have required property '"+"verifiedEmailAt"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.status === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.createdAt === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "createdAt"},message:"must have required property '"+"createdAt"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
for(const key0 in data){
if(!((((((key0 === "id") || (key0 === "email")) || (key0 === "displayName")) || (key0 === "verifiedEmailAt")) || (key0 === "status")) || (key0 === "createdAt"))){
const err6 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.id !== undefined){
let data0 = data.id;
if(typeof data0 === "string"){
if(func1(data0) < 1){
const err7 = {instancePath:instancePath+"/id",schemaPath:"#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/id",schemaPath:"#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.email !== undefined){
let data1 = data.email;
if(typeof data1 === "string"){
if(!(formats6.test(data1))){
const err9 = {instancePath:instancePath+"/email",schemaPath:"#/properties/email/format",keyword:"format",params:{format: "email"},message:"must match format \""+"email"+"\""};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/email",schemaPath:"#/properties/email/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.displayName !== undefined){
let data2 = data.displayName;
const _errs8 = errors;
let valid2 = false;
const _errs9 = errors;
if(typeof data2 !== "string"){
const err11 = {instancePath:instancePath+"/displayName",schemaPath:"#/properties/displayName/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
var _valid0 = _errs9 === errors;
valid2 = valid2 || _valid0;
const _errs11 = errors;
if(data2 !== null){
const err12 = {instancePath:instancePath+"/displayName",schemaPath:"#/properties/displayName/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
var _valid0 = _errs11 === errors;
valid2 = valid2 || _valid0;
if(!valid2){
const err13 = {instancePath:instancePath+"/displayName",schemaPath:"#/properties/displayName/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
else {
errors = _errs8;
if(vErrors !== null){
if(_errs8){
vErrors.length = _errs8;
}
else {
vErrors = null;
}
}
}
}
if(data.verifiedEmailAt !== undefined){
let data3 = data.verifiedEmailAt;
const _errs14 = errors;
let valid3 = false;
const _errs15 = errors;
if(typeof data3 === "string"){
if(!(formats0.validate(data3))){
const err14 = {instancePath:instancePath+"/verifiedEmailAt",schemaPath:"#/components/schemas/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
else {
const err15 = {instancePath:instancePath+"/verifiedEmailAt",schemaPath:"#/components/schemas/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
var _valid1 = _errs15 === errors;
valid3 = valid3 || _valid1;
const _errs18 = errors;
if(data3 !== null){
const err16 = {instancePath:instancePath+"/verifiedEmailAt",schemaPath:"#/properties/verifiedEmailAt/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
var _valid1 = _errs18 === errors;
valid3 = valid3 || _valid1;
if(!valid3){
const err17 = {instancePath:instancePath+"/verifiedEmailAt",schemaPath:"#/properties/verifiedEmailAt/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
else {
errors = _errs14;
if(vErrors !== null){
if(_errs14){
vErrors.length = _errs14;
}
else {
vErrors = null;
}
}
}
}
if(data.status !== undefined){
if(typeof data.status !== "string"){
const err18 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.createdAt !== undefined){
let data5 = data.createdAt;
if(typeof data5 === "string"){
if(!(formats0.validate(data5))){
const err19 = {instancePath:instancePath+"/createdAt",schemaPath:"#/components/schemas/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
else {
const err20 = {instancePath:instancePath+"/createdAt",schemaPath:"#/components/schemas/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
}
else {
const err21 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
validate30.errors = vErrors;
return errors === 0;
}
validate30.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate29(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_ProvisionStaffResponse" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate29.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.success === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "success"},message:"must have required property '"+"success"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.data === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "data"},message:"must have required property '"+"data"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "success") || (key0 === "data"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.success !== undefined){
if(true !== data.success){
const err3 = {instancePath:instancePath+"/success",schemaPath:"#/properties/success/const",keyword:"const",params:{allowedValue: true},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.data !== undefined){
let data1 = data.data;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.user === undefined){
const err4 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/required",keyword:"required",params:{missingProperty: "user"},message:"must have required property '"+"user"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data1.role === undefined){
const err5 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/required",keyword:"required",params:{missingProperty: "role"},message:"must have required property '"+"role"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data1.provider === undefined){
const err6 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/required",keyword:"required",params:{missingProperty: "provider"},message:"must have required property '"+"provider"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data1.accessSubject === undefined){
const err7 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/required",keyword:"required",params:{missingProperty: "accessSubject"},message:"must have required property '"+"accessSubject"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data1.message === undefined){
const err8 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/required",keyword:"required",params:{missingProperty: "message"},message:"must have required property '"+"message"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
for(const key1 in data1){
if(!(((((key1 === "user") || (key1 === "role")) || (key1 === "provider")) || (key1 === "accessSubject")) || (key1 === "message"))){
const err9 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data1.user !== undefined){
if(!(validate30(data1.user, {instancePath:instancePath+"/data/user",parentData:data1,parentDataProperty:"user",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate30.errors : vErrors.concat(validate30.errors);
errors = vErrors.length;
}
}
if(data1.role !== undefined){
let data3 = data1.role;
if(typeof data3 !== "string"){
const err10 = {instancePath:instancePath+"/data/role",schemaPath:"#/properties/data/properties/role/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(!(((data3 === "staff_reviewer") || (data3 === "finance_manager")) || (data3 === "superadmin"))){
const err11 = {instancePath:instancePath+"/data/role",schemaPath:"#/properties/data/properties/role/enum",keyword:"enum",params:{allowedValues: schema43.properties.data.properties.role.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data1.provider !== undefined){
let data4 = data1.provider;
if(typeof data4 !== "string"){
const err12 = {instancePath:instancePath+"/data/provider",schemaPath:"#/properties/data/properties/provider/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if("cloudflare_access" !== data4){
const err13 = {instancePath:instancePath+"/data/provider",schemaPath:"#/properties/data/properties/provider/const",keyword:"const",params:{allowedValue: "cloudflare_access"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data1.accessSubject !== undefined){
if(typeof data1.accessSubject !== "string"){
const err14 = {instancePath:instancePath+"/data/accessSubject",schemaPath:"#/properties/data/properties/accessSubject/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data1.message !== undefined){
if(typeof data1.message !== "string"){
const err15 = {instancePath:instancePath+"/data/message",schemaPath:"#/properties/data/properties/message/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
}
else {
const err16 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
}
else {
const err17 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
validate29.errors = vErrors;
return errors === 0;
}
validate29.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_ResendEvent = validate32;
const schema48 = {"$id":"schema_ResendEvent","type":"object","additionalProperties":true,"description":"Resend webhook payload (Svix-signed).","properties":{"type":{"type":"string"},"created_at":{"type":"string"},"data":{"type":"object","additionalProperties":true}},"required":["type","data"]};

function validate32(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_ResendEvent" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate32.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.type === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.data === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "data"},message:"must have required property '"+"data"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.type !== undefined){
if(typeof data.type !== "string"){
const err2 = {instancePath:instancePath+"/type",schemaPath:"#/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.created_at !== undefined){
if(typeof data.created_at !== "string"){
const err3 = {instancePath:instancePath+"/created_at",schemaPath:"#/properties/created_at/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.data !== undefined){
let data2 = data.data;
if(data2 && typeof data2 == "object" && !Array.isArray(data2)){
}
else {
const err4 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
}
else {
const err5 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
validate32.errors = vErrors;
return errors === 0;
}
validate32.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_ResendWebhookResponse = validate33;
const schema49 = {"$id":"schema_ResendWebhookResponse","type":"object","additionalProperties":false,"properties":{"received":{"const":true},"applied":{"type":"boolean"}},"required":["received","applied"]};

function validate33(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_ResendWebhookResponse" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate33.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.received === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "received"},message:"must have required property '"+"received"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.applied === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "applied"},message:"must have required property '"+"applied"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "received") || (key0 === "applied"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.received !== undefined){
if(true !== data.received){
const err3 = {instancePath:instancePath+"/received",schemaPath:"#/properties/received/const",keyword:"const",params:{allowedValue: true},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.applied !== undefined){
if(typeof data.applied !== "boolean"){
const err4 = {instancePath:instancePath+"/applied",schemaPath:"#/properties/applied/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
}
else {
const err5 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
validate33.errors = vErrors;
return errors === 0;
}
validate33.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_CursorMeta = validate34;
const schema50 = {"$id":"schema_CursorMeta","type":"object","additionalProperties":false,"properties":{"nextCursor":{"type":["string","null"],"description":"Opaque keyset cursor scoped to the filters; null on the last page."}},"required":["nextCursor"]};

function validate34(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_CursorMeta" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate34.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.nextCursor === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "nextCursor"},message:"must have required property '"+"nextCursor"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
for(const key0 in data){
if(!(key0 === "nextCursor")){
const err1 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
if(data.nextCursor !== undefined){
let data0 = data.nextCursor;
if((typeof data0 !== "string") && (data0 !== null)){
const err2 = {instancePath:instancePath+"/nextCursor",schemaPath:"#/properties/nextCursor/type",keyword:"type",params:{type: schema50.properties.nextCursor.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
}
else {
const err3 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
validate34.errors = vErrors;
return errors === 0;
}
validate34.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_FormProgram = validate35;
const schema51 = {"$id":"schema_FormProgram","type":"string","enum":["worship","production","academy","web"],"description":"Program that hosts the public form page."};

function validate35(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_FormProgram" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate35.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(typeof data !== "string"){
const err0 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(!((((data === "worship") || (data === "production")) || (data === "academy")) || (data === "web"))){
const err1 = {instancePath,schemaPath:"#/enum",keyword:"enum",params:{allowedValues: schema51.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
validate35.errors = vErrors;
return errors === 0;
}
validate35.evaluated = {"dynamicProps":false,"dynamicItems":false};

export const schema_FormKind = validate36;
const schema52 = {"$id":"schema_FormKind","type":"string","enum":["musician_application","technician_application","church_request","production_request","contact","partner_interest"],"description":"Decides which bind keys a form must define before it can be published."};

function validate36(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_FormKind" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate36.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(typeof data !== "string"){
const err0 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(!((((((data === "musician_application") || (data === "technician_application")) || (data === "church_request")) || (data === "production_request")) || (data === "contact")) || (data === "partner_interest"))){
const err1 = {instancePath,schemaPath:"#/enum",keyword:"enum",params:{allowedValues: schema52.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
validate36.errors = vErrors;
return errors === 0;
}
validate36.evaluated = {"dynamicProps":false,"dynamicItems":false};

export const schema_FormStatus = validate37;
const schema53 = {"$id":"schema_FormStatus","type":"string","enum":["draft","published","closed"]};

function validate37(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_FormStatus" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate37.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(typeof data !== "string"){
const err0 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(!(((data === "draft") || (data === "published")) || (data === "closed"))){
const err1 = {instancePath,schemaPath:"#/enum",keyword:"enum",params:{allowedValues: schema53.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
validate37.errors = vErrors;
return errors === 0;
}
validate37.evaluated = {"dynamicProps":false,"dynamicItems":false};

export const schema_SubmissionStatus = validate38;
const schema54 = {"$id":"schema_SubmissionStatus","type":"string","enum":["new","in_review","approved","declined","closed"]};

function validate38(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_SubmissionStatus" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate38.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(typeof data !== "string"){
const err0 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(!(((((data === "new") || (data === "in_review")) || (data === "approved")) || (data === "declined")) || (data === "closed"))){
const err1 = {instancePath,schemaPath:"#/enum",keyword:"enum",params:{allowedValues: schema54.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
validate38.errors = vErrors;
return errors === 0;
}
validate38.evaluated = {"dynamicProps":false,"dynamicItems":false};

export const schema_FormSchema = validate39;
const schema55 = {"$id":"schema_FormSchema","$comment":"Authoritative definition (question types, validation rules, sections, showIf, bind keys) is the zod schema in packages/domain/src/forms/schema.ts (parseFormSchema). It is deliberately not mirrored here; the server validates with parseFormSchema and rejects invalid drafts with 400.","type":"object","additionalProperties":true,"description":"Form definition: sections of questions as parsed by parseFormSchema. Open-ended on the wire; staff-authored drafts and published versions both use this shape."};

function validate39(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_FormSchema" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate39.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
}
else {
const err0 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
validate39.errors = vErrors;
return errors === 0;
}
validate39.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_FormSummary = validate40;
const schema56 = {"$id":"schema_FormSummary","type":"object","additionalProperties":false,"properties":{"id":{"$ref":"gamo#/components/schemas/Identifier"},"slug":{"type":"string"},"program":{"$ref":"gamo#/components/schemas/FormProgram"},"kind":{"$ref":"gamo#/components/schemas/FormKind"},"title":{"type":"string"},"status":{"$ref":"gamo#/components/schemas/FormStatus"},"currentVersion":{"type":["integer","null"],"minimum":1,"description":"Latest published version number; null while only a draft exists."},"updatedAt":{"$ref":"gamo#/components/schemas/Timestamp"}},"required":["id","slug","program","kind","title","status","currentVersion","updatedAt"]};
const schema58 = {"type":"string","enum":["worship","production","academy","web"],"description":"Program that hosts the public form page."};
const schema59 = {"type":"string","enum":["musician_application","technician_application","church_request","production_request","contact","partner_interest"],"description":"Decides which bind keys a form must define before it can be published."};
const schema60 = {"type":"string","enum":["draft","published","closed"]};

function validate40(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_FormSummary" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate40.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.slug === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "slug"},message:"must have required property '"+"slug"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.program === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "program"},message:"must have required property '"+"program"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.kind === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.title === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.status === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.currentVersion === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "currentVersion"},message:"must have required property '"+"currentVersion"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.updatedAt === undefined){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "updatedAt"},message:"must have required property '"+"updatedAt"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
for(const key0 in data){
if(!((((((((key0 === "id") || (key0 === "slug")) || (key0 === "program")) || (key0 === "kind")) || (key0 === "title")) || (key0 === "status")) || (key0 === "currentVersion")) || (key0 === "updatedAt"))){
const err8 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.id !== undefined){
let data0 = data.id;
if(typeof data0 === "string"){
if(func1(data0) < 1){
const err9 = {instancePath:instancePath+"/id",schemaPath:"gamo#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/id",schemaPath:"gamo#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.slug !== undefined){
if(typeof data.slug !== "string"){
const err11 = {instancePath:instancePath+"/slug",schemaPath:"#/properties/slug/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.program !== undefined){
let data2 = data.program;
if(typeof data2 !== "string"){
const err12 = {instancePath:instancePath+"/program",schemaPath:"gamo#/components/schemas/FormProgram/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(!((((data2 === "worship") || (data2 === "production")) || (data2 === "academy")) || (data2 === "web"))){
const err13 = {instancePath:instancePath+"/program",schemaPath:"gamo#/components/schemas/FormProgram/enum",keyword:"enum",params:{allowedValues: schema58.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.kind !== undefined){
let data3 = data.kind;
if(typeof data3 !== "string"){
const err14 = {instancePath:instancePath+"/kind",schemaPath:"gamo#/components/schemas/FormKind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(!((((((data3 === "musician_application") || (data3 === "technician_application")) || (data3 === "church_request")) || (data3 === "production_request")) || (data3 === "contact")) || (data3 === "partner_interest"))){
const err15 = {instancePath:instancePath+"/kind",schemaPath:"gamo#/components/schemas/FormKind/enum",keyword:"enum",params:{allowedValues: schema59.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.title !== undefined){
if(typeof data.title !== "string"){
const err16 = {instancePath:instancePath+"/title",schemaPath:"#/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data.status !== undefined){
let data5 = data.status;
if(typeof data5 !== "string"){
const err17 = {instancePath:instancePath+"/status",schemaPath:"gamo#/components/schemas/FormStatus/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if(!(((data5 === "draft") || (data5 === "published")) || (data5 === "closed"))){
const err18 = {instancePath:instancePath+"/status",schemaPath:"gamo#/components/schemas/FormStatus/enum",keyword:"enum",params:{allowedValues: schema60.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.currentVersion !== undefined){
let data6 = data.currentVersion;
if((!((typeof data6 == "number") && (!(data6 % 1) && !isNaN(data6)))) && (data6 !== null)){
const err19 = {instancePath:instancePath+"/currentVersion",schemaPath:"#/properties/currentVersion/type",keyword:"type",params:{type: schema56.properties.currentVersion.type},message:"must be integer,null"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if(typeof data6 == "number"){
if(data6 < 1 || isNaN(data6)){
const err20 = {instancePath:instancePath+"/currentVersion",schemaPath:"#/properties/currentVersion/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
}
if(data.updatedAt !== undefined){
let data7 = data.updatedAt;
if(typeof data7 === "string"){
if(!(formats0.validate(data7))){
const err21 = {instancePath:instancePath+"/updatedAt",schemaPath:"gamo#/components/schemas/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
else {
const err22 = {instancePath:instancePath+"/updatedAt",schemaPath:"gamo#/components/schemas/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
}
else {
const err23 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
validate40.errors = vErrors;
return errors === 0;
}
validate40.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_FormDetail = validate41;
const schema62 = {"$id":"schema_FormDetail","type":"object","additionalProperties":false,"properties":{"id":{"$ref":"gamo#/components/schemas/Identifier"},"slug":{"type":"string"},"program":{"$ref":"gamo#/components/schemas/FormProgram"},"kind":{"$ref":"gamo#/components/schemas/FormKind"},"title":{"type":"string"},"description":{"type":["string","null"]},"status":{"$ref":"gamo#/components/schemas/FormStatus"},"confirmationMessage":{"type":["string","null"]},"currentVersionId":{"oneOf":[{"$ref":"gamo#/components/schemas/Identifier"},{"type":"null"}]},"currentVersion":{"type":["integer","null"],"minimum":1},"draftSchema":{"$ref":"gamo#/components/schemas/FormSchema"},"updatedAt":{"$ref":"gamo#/components/schemas/Timestamp"}},"required":["id","slug","program","kind","title","status","draftSchema","updatedAt"]};
const schema68 = {"$comment":"Authoritative definition (question types, validation rules, sections, showIf, bind keys) is the zod schema in packages/domain/src/forms/schema.ts (parseFormSchema). It is deliberately not mirrored here; the server validates with parseFormSchema and rejects invalid drafts with 400.","type":"object","additionalProperties":true,"description":"Form definition: sections of questions as parsed by parseFormSchema. Open-ended on the wire; staff-authored drafts and published versions both use this shape."};
const func11 = Object.prototype.hasOwnProperty;

function validate41(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_FormDetail" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate41.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.slug === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "slug"},message:"must have required property '"+"slug"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.program === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "program"},message:"must have required property '"+"program"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.kind === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.title === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.status === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.draftSchema === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "draftSchema"},message:"must have required property '"+"draftSchema"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.updatedAt === undefined){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "updatedAt"},message:"must have required property '"+"updatedAt"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
for(const key0 in data){
if(!(func11.call(schema62.properties, key0))){
const err8 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.id !== undefined){
let data0 = data.id;
if(typeof data0 === "string"){
if(func1(data0) < 1){
const err9 = {instancePath:instancePath+"/id",schemaPath:"gamo#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/id",schemaPath:"gamo#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.slug !== undefined){
if(typeof data.slug !== "string"){
const err11 = {instancePath:instancePath+"/slug",schemaPath:"#/properties/slug/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.program !== undefined){
let data2 = data.program;
if(typeof data2 !== "string"){
const err12 = {instancePath:instancePath+"/program",schemaPath:"gamo#/components/schemas/FormProgram/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(!((((data2 === "worship") || (data2 === "production")) || (data2 === "academy")) || (data2 === "web"))){
const err13 = {instancePath:instancePath+"/program",schemaPath:"gamo#/components/schemas/FormProgram/enum",keyword:"enum",params:{allowedValues: schema58.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.kind !== undefined){
let data3 = data.kind;
if(typeof data3 !== "string"){
const err14 = {instancePath:instancePath+"/kind",schemaPath:"gamo#/components/schemas/FormKind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(!((((((data3 === "musician_application") || (data3 === "technician_application")) || (data3 === "church_request")) || (data3 === "production_request")) || (data3 === "contact")) || (data3 === "partner_interest"))){
const err15 = {instancePath:instancePath+"/kind",schemaPath:"gamo#/components/schemas/FormKind/enum",keyword:"enum",params:{allowedValues: schema59.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.title !== undefined){
if(typeof data.title !== "string"){
const err16 = {instancePath:instancePath+"/title",schemaPath:"#/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data.description !== undefined){
let data5 = data.description;
if((typeof data5 !== "string") && (data5 !== null)){
const err17 = {instancePath:instancePath+"/description",schemaPath:"#/properties/description/type",keyword:"type",params:{type: schema62.properties.description.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data.status !== undefined){
let data6 = data.status;
if(typeof data6 !== "string"){
const err18 = {instancePath:instancePath+"/status",schemaPath:"gamo#/components/schemas/FormStatus/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
if(!(((data6 === "draft") || (data6 === "published")) || (data6 === "closed"))){
const err19 = {instancePath:instancePath+"/status",schemaPath:"gamo#/components/schemas/FormStatus/enum",keyword:"enum",params:{allowedValues: schema60.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
if(data.confirmationMessage !== undefined){
let data7 = data.confirmationMessage;
if((typeof data7 !== "string") && (data7 !== null)){
const err20 = {instancePath:instancePath+"/confirmationMessage",schemaPath:"#/properties/confirmationMessage/type",keyword:"type",params:{type: schema62.properties.confirmationMessage.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
if(data.currentVersionId !== undefined){
let data8 = data.currentVersionId;
const _errs23 = errors;
let valid5 = false;
let passing0 = null;
const _errs24 = errors;
if(typeof data8 === "string"){
if(func1(data8) < 1){
const err21 = {instancePath:instancePath+"/currentVersionId",schemaPath:"gamo#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
else {
const err22 = {instancePath:instancePath+"/currentVersionId",schemaPath:"gamo#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
var _valid0 = _errs24 === errors;
if(_valid0){
valid5 = true;
passing0 = 0;
}
const _errs27 = errors;
if(data8 !== null){
const err23 = {instancePath:instancePath+"/currentVersionId",schemaPath:"#/properties/currentVersionId/oneOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
var _valid0 = _errs27 === errors;
if(_valid0 && valid5){
valid5 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid5 = true;
passing0 = 1;
}
}
if(!valid5){
const err24 = {instancePath:instancePath+"/currentVersionId",schemaPath:"#/properties/currentVersionId/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
else {
errors = _errs23;
if(vErrors !== null){
if(_errs23){
vErrors.length = _errs23;
}
else {
vErrors = null;
}
}
}
}
if(data.currentVersion !== undefined){
let data9 = data.currentVersion;
if((!((typeof data9 == "number") && (!(data9 % 1) && !isNaN(data9)))) && (data9 !== null)){
const err25 = {instancePath:instancePath+"/currentVersion",schemaPath:"#/properties/currentVersion/type",keyword:"type",params:{type: schema62.properties.currentVersion.type},message:"must be integer,null"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
if(typeof data9 == "number"){
if(data9 < 1 || isNaN(data9)){
const err26 = {instancePath:instancePath+"/currentVersion",schemaPath:"#/properties/currentVersion/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
}
if(data.draftSchema !== undefined){
let data10 = data.draftSchema;
if(data10 && typeof data10 == "object" && !Array.isArray(data10)){
}
else {
const err27 = {instancePath:instancePath+"/draftSchema",schemaPath:"gamo#/components/schemas/FormSchema/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
if(data.updatedAt !== undefined){
let data11 = data.updatedAt;
if(typeof data11 === "string"){
if(!(formats0.validate(data11))){
const err28 = {instancePath:instancePath+"/updatedAt",schemaPath:"gamo#/components/schemas/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
else {
const err29 = {instancePath:instancePath+"/updatedAt",schemaPath:"gamo#/components/schemas/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
}
else {
const err30 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
validate41.errors = vErrors;
return errors === 0;
}
validate41.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_CreateFormInput = validate42;
const schema70 = {"$id":"schema_CreateFormInput","type":"object","additionalProperties":false,"properties":{"slug":{"type":"string","minLength":1,"maxLength":80,"pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$"},"program":{"$ref":"gamo#/components/schemas/FormProgram"},"kind":{"$ref":"gamo#/components/schemas/FormKind"},"title":{"type":"string","minLength":1,"maxLength":200},"description":{"type":"string","maxLength":2000},"confirmationMessage":{"type":"string","maxLength":2000},"schema":{"$ref":"gamo#/components/schemas/FormSchema"}},"required":["slug","program","kind","title"]};
const pattern4 = new RegExp("^[a-z0-9]+(?:-[a-z0-9]+)*$", "u");

function validate42(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_CreateFormInput" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate42.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.slug === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "slug"},message:"must have required property '"+"slug"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.program === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "program"},message:"must have required property '"+"program"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.kind === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.title === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
for(const key0 in data){
if(!(((((((key0 === "slug") || (key0 === "program")) || (key0 === "kind")) || (key0 === "title")) || (key0 === "description")) || (key0 === "confirmationMessage")) || (key0 === "schema"))){
const err4 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.slug !== undefined){
let data0 = data.slug;
if(typeof data0 === "string"){
if(func1(data0) > 80){
const err5 = {instancePath:instancePath+"/slug",schemaPath:"#/properties/slug/maxLength",keyword:"maxLength",params:{limit: 80},message:"must NOT have more than 80 characters"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(func1(data0) < 1){
const err6 = {instancePath:instancePath+"/slug",schemaPath:"#/properties/slug/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(!pattern4.test(data0)){
const err7 = {instancePath:instancePath+"/slug",schemaPath:"#/properties/slug/pattern",keyword:"pattern",params:{pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$"},message:"must match pattern \""+"^[a-z0-9]+(?:-[a-z0-9]+)*$"+"\""};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/slug",schemaPath:"#/properties/slug/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.program !== undefined){
let data1 = data.program;
if(typeof data1 !== "string"){
const err9 = {instancePath:instancePath+"/program",schemaPath:"gamo#/components/schemas/FormProgram/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(!((((data1 === "worship") || (data1 === "production")) || (data1 === "academy")) || (data1 === "web"))){
const err10 = {instancePath:instancePath+"/program",schemaPath:"gamo#/components/schemas/FormProgram/enum",keyword:"enum",params:{allowedValues: schema58.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.kind !== undefined){
let data2 = data.kind;
if(typeof data2 !== "string"){
const err11 = {instancePath:instancePath+"/kind",schemaPath:"gamo#/components/schemas/FormKind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(!((((((data2 === "musician_application") || (data2 === "technician_application")) || (data2 === "church_request")) || (data2 === "production_request")) || (data2 === "contact")) || (data2 === "partner_interest"))){
const err12 = {instancePath:instancePath+"/kind",schemaPath:"gamo#/components/schemas/FormKind/enum",keyword:"enum",params:{allowedValues: schema59.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.title !== undefined){
let data3 = data.title;
if(typeof data3 === "string"){
if(func1(data3) > 200){
const err13 = {instancePath:instancePath+"/title",schemaPath:"#/properties/title/maxLength",keyword:"maxLength",params:{limit: 200},message:"must NOT have more than 200 characters"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(func1(data3) < 1){
const err14 = {instancePath:instancePath+"/title",schemaPath:"#/properties/title/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
else {
const err15 = {instancePath:instancePath+"/title",schemaPath:"#/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.description !== undefined){
let data4 = data.description;
if(typeof data4 === "string"){
if(func1(data4) > 2000){
const err16 = {instancePath:instancePath+"/description",schemaPath:"#/properties/description/maxLength",keyword:"maxLength",params:{limit: 2000},message:"must NOT have more than 2000 characters"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
else {
const err17 = {instancePath:instancePath+"/description",schemaPath:"#/properties/description/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data.confirmationMessage !== undefined){
let data5 = data.confirmationMessage;
if(typeof data5 === "string"){
if(func1(data5) > 2000){
const err18 = {instancePath:instancePath+"/confirmationMessage",schemaPath:"#/properties/confirmationMessage/maxLength",keyword:"maxLength",params:{limit: 2000},message:"must NOT have more than 2000 characters"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
else {
const err19 = {instancePath:instancePath+"/confirmationMessage",schemaPath:"#/properties/confirmationMessage/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
if(data.schema !== undefined){
let data6 = data.schema;
if(data6 && typeof data6 == "object" && !Array.isArray(data6)){
}
else {
const err20 = {instancePath:instancePath+"/schema",schemaPath:"gamo#/components/schemas/FormSchema/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
}
else {
const err21 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
validate42.errors = vErrors;
return errors === 0;
}
validate42.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_SaveFormDraftInput = validate43;
const schema74 = {"$id":"schema_SaveFormDraftInput","type":"object","additionalProperties":false,"properties":{"title":{"type":"string","minLength":1,"maxLength":200},"description":{"type":"string","maxLength":2000},"confirmationMessage":{"type":"string","maxLength":2000},"schema":{"$ref":"gamo#/components/schemas/FormSchema"}},"required":["schema"]};

function validate43(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_SaveFormDraftInput" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate43.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.schema === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "schema"},message:"must have required property '"+"schema"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
for(const key0 in data){
if(!((((key0 === "title") || (key0 === "description")) || (key0 === "confirmationMessage")) || (key0 === "schema"))){
const err1 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
if(data.title !== undefined){
let data0 = data.title;
if(typeof data0 === "string"){
if(func1(data0) > 200){
const err2 = {instancePath:instancePath+"/title",schemaPath:"#/properties/title/maxLength",keyword:"maxLength",params:{limit: 200},message:"must NOT have more than 200 characters"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(func1(data0) < 1){
const err3 = {instancePath:instancePath+"/title",schemaPath:"#/properties/title/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
else {
const err4 = {instancePath:instancePath+"/title",schemaPath:"#/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.description !== undefined){
let data1 = data.description;
if(typeof data1 === "string"){
if(func1(data1) > 2000){
const err5 = {instancePath:instancePath+"/description",schemaPath:"#/properties/description/maxLength",keyword:"maxLength",params:{limit: 2000},message:"must NOT have more than 2000 characters"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
else {
const err6 = {instancePath:instancePath+"/description",schemaPath:"#/properties/description/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.confirmationMessage !== undefined){
let data2 = data.confirmationMessage;
if(typeof data2 === "string"){
if(func1(data2) > 2000){
const err7 = {instancePath:instancePath+"/confirmationMessage",schemaPath:"#/properties/confirmationMessage/maxLength",keyword:"maxLength",params:{limit: 2000},message:"must NOT have more than 2000 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/confirmationMessage",schemaPath:"#/properties/confirmationMessage/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.schema !== undefined){
let data3 = data.schema;
if(data3 && typeof data3 == "object" && !Array.isArray(data3)){
}
else {
const err9 = {instancePath:instancePath+"/schema",schemaPath:"gamo#/components/schemas/FormSchema/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
}
else {
const err10 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
validate43.errors = vErrors;
return errors === 0;
}
validate43.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_FormResponse = validate44;
const schema76 = {"$id":"schema_FormResponse","type":"object","additionalProperties":false,"properties":{"success":{"const":true},"data":{"$ref":"gamo#/components/schemas/FormDetail"}},"required":["success","data"]};
const schema77 = {"type":"object","additionalProperties":false,"properties":{"id":{"$ref":"#/components/schemas/Identifier"},"slug":{"type":"string"},"program":{"$ref":"#/components/schemas/FormProgram"},"kind":{"$ref":"#/components/schemas/FormKind"},"title":{"type":"string"},"description":{"type":["string","null"]},"status":{"$ref":"#/components/schemas/FormStatus"},"confirmationMessage":{"type":["string","null"]},"currentVersionId":{"oneOf":[{"$ref":"#/components/schemas/Identifier"},{"type":"null"}]},"currentVersion":{"type":["integer","null"],"minimum":1},"draftSchema":{"$ref":"#/components/schemas/FormSchema"},"updatedAt":{"$ref":"#/components/schemas/Timestamp"}},"required":["id","slug","program","kind","title","status","draftSchema","updatedAt"]};

function validate45(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate45.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.slug === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "slug"},message:"must have required property '"+"slug"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.program === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "program"},message:"must have required property '"+"program"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.kind === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.title === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.status === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.draftSchema === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "draftSchema"},message:"must have required property '"+"draftSchema"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.updatedAt === undefined){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "updatedAt"},message:"must have required property '"+"updatedAt"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
for(const key0 in data){
if(!(func11.call(schema77.properties, key0))){
const err8 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.id !== undefined){
let data0 = data.id;
if(typeof data0 === "string"){
if(func1(data0) < 1){
const err9 = {instancePath:instancePath+"/id",schemaPath:"#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/id",schemaPath:"#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.slug !== undefined){
if(typeof data.slug !== "string"){
const err11 = {instancePath:instancePath+"/slug",schemaPath:"#/properties/slug/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.program !== undefined){
let data2 = data.program;
if(typeof data2 !== "string"){
const err12 = {instancePath:instancePath+"/program",schemaPath:"#/components/schemas/FormProgram/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(!((((data2 === "worship") || (data2 === "production")) || (data2 === "academy")) || (data2 === "web"))){
const err13 = {instancePath:instancePath+"/program",schemaPath:"#/components/schemas/FormProgram/enum",keyword:"enum",params:{allowedValues: schema58.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.kind !== undefined){
let data3 = data.kind;
if(typeof data3 !== "string"){
const err14 = {instancePath:instancePath+"/kind",schemaPath:"#/components/schemas/FormKind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(!((((((data3 === "musician_application") || (data3 === "technician_application")) || (data3 === "church_request")) || (data3 === "production_request")) || (data3 === "contact")) || (data3 === "partner_interest"))){
const err15 = {instancePath:instancePath+"/kind",schemaPath:"#/components/schemas/FormKind/enum",keyword:"enum",params:{allowedValues: schema59.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.title !== undefined){
if(typeof data.title !== "string"){
const err16 = {instancePath:instancePath+"/title",schemaPath:"#/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data.description !== undefined){
let data5 = data.description;
if((typeof data5 !== "string") && (data5 !== null)){
const err17 = {instancePath:instancePath+"/description",schemaPath:"#/properties/description/type",keyword:"type",params:{type: schema77.properties.description.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data.status !== undefined){
let data6 = data.status;
if(typeof data6 !== "string"){
const err18 = {instancePath:instancePath+"/status",schemaPath:"#/components/schemas/FormStatus/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
if(!(((data6 === "draft") || (data6 === "published")) || (data6 === "closed"))){
const err19 = {instancePath:instancePath+"/status",schemaPath:"#/components/schemas/FormStatus/enum",keyword:"enum",params:{allowedValues: schema60.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
if(data.confirmationMessage !== undefined){
let data7 = data.confirmationMessage;
if((typeof data7 !== "string") && (data7 !== null)){
const err20 = {instancePath:instancePath+"/confirmationMessage",schemaPath:"#/properties/confirmationMessage/type",keyword:"type",params:{type: schema77.properties.confirmationMessage.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
if(data.currentVersionId !== undefined){
let data8 = data.currentVersionId;
const _errs23 = errors;
let valid5 = false;
let passing0 = null;
const _errs24 = errors;
if(typeof data8 === "string"){
if(func1(data8) < 1){
const err21 = {instancePath:instancePath+"/currentVersionId",schemaPath:"#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
else {
const err22 = {instancePath:instancePath+"/currentVersionId",schemaPath:"#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
var _valid0 = _errs24 === errors;
if(_valid0){
valid5 = true;
passing0 = 0;
}
const _errs27 = errors;
if(data8 !== null){
const err23 = {instancePath:instancePath+"/currentVersionId",schemaPath:"#/properties/currentVersionId/oneOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
var _valid0 = _errs27 === errors;
if(_valid0 && valid5){
valid5 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid5 = true;
passing0 = 1;
}
}
if(!valid5){
const err24 = {instancePath:instancePath+"/currentVersionId",schemaPath:"#/properties/currentVersionId/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
else {
errors = _errs23;
if(vErrors !== null){
if(_errs23){
vErrors.length = _errs23;
}
else {
vErrors = null;
}
}
}
}
if(data.currentVersion !== undefined){
let data9 = data.currentVersion;
if((!((typeof data9 == "number") && (!(data9 % 1) && !isNaN(data9)))) && (data9 !== null)){
const err25 = {instancePath:instancePath+"/currentVersion",schemaPath:"#/properties/currentVersion/type",keyword:"type",params:{type: schema77.properties.currentVersion.type},message:"must be integer,null"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
if(typeof data9 == "number"){
if(data9 < 1 || isNaN(data9)){
const err26 = {instancePath:instancePath+"/currentVersion",schemaPath:"#/properties/currentVersion/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
}
if(data.draftSchema !== undefined){
let data10 = data.draftSchema;
if(data10 && typeof data10 == "object" && !Array.isArray(data10)){
}
else {
const err27 = {instancePath:instancePath+"/draftSchema",schemaPath:"#/components/schemas/FormSchema/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
if(data.updatedAt !== undefined){
let data11 = data.updatedAt;
if(typeof data11 === "string"){
if(!(formats0.validate(data11))){
const err28 = {instancePath:instancePath+"/updatedAt",schemaPath:"#/components/schemas/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
else {
const err29 = {instancePath:instancePath+"/updatedAt",schemaPath:"#/components/schemas/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
}
else {
const err30 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
validate45.errors = vErrors;
return errors === 0;
}
validate45.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate44(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_FormResponse" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate44.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.success === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "success"},message:"must have required property '"+"success"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.data === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "data"},message:"must have required property '"+"data"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "success") || (key0 === "data"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.success !== undefined){
if(true !== data.success){
const err3 = {instancePath:instancePath+"/success",schemaPath:"#/properties/success/const",keyword:"const",params:{allowedValue: true},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.data !== undefined){
if(!(validate45(data.data, {instancePath:instancePath+"/data",parentData:data,parentDataProperty:"data",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate45.errors : vErrors.concat(validate45.errors);
errors = vErrors.length;
}
}
}
else {
const err4 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
validate44.errors = vErrors;
return errors === 0;
}
validate44.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_FormListResponse = validate47;
const schema85 = {"$id":"schema_FormListResponse","type":"object","additionalProperties":false,"properties":{"success":{"const":true},"data":{"type":"array","items":{"$ref":"gamo#/components/schemas/FormSummary"}}},"required":["success","data"]};
const schema86 = {"type":"object","additionalProperties":false,"properties":{"id":{"$ref":"#/components/schemas/Identifier"},"slug":{"type":"string"},"program":{"$ref":"#/components/schemas/FormProgram"},"kind":{"$ref":"#/components/schemas/FormKind"},"title":{"type":"string"},"status":{"$ref":"#/components/schemas/FormStatus"},"currentVersion":{"type":["integer","null"],"minimum":1,"description":"Latest published version number; null while only a draft exists."},"updatedAt":{"$ref":"#/components/schemas/Timestamp"}},"required":["id","slug","program","kind","title","status","currentVersion","updatedAt"]};

function validate48(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate48.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.slug === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "slug"},message:"must have required property '"+"slug"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.program === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "program"},message:"must have required property '"+"program"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.kind === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.title === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.status === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.currentVersion === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "currentVersion"},message:"must have required property '"+"currentVersion"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.updatedAt === undefined){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "updatedAt"},message:"must have required property '"+"updatedAt"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
for(const key0 in data){
if(!((((((((key0 === "id") || (key0 === "slug")) || (key0 === "program")) || (key0 === "kind")) || (key0 === "title")) || (key0 === "status")) || (key0 === "currentVersion")) || (key0 === "updatedAt"))){
const err8 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.id !== undefined){
let data0 = data.id;
if(typeof data0 === "string"){
if(func1(data0) < 1){
const err9 = {instancePath:instancePath+"/id",schemaPath:"#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/id",schemaPath:"#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.slug !== undefined){
if(typeof data.slug !== "string"){
const err11 = {instancePath:instancePath+"/slug",schemaPath:"#/properties/slug/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.program !== undefined){
let data2 = data.program;
if(typeof data2 !== "string"){
const err12 = {instancePath:instancePath+"/program",schemaPath:"#/components/schemas/FormProgram/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(!((((data2 === "worship") || (data2 === "production")) || (data2 === "academy")) || (data2 === "web"))){
const err13 = {instancePath:instancePath+"/program",schemaPath:"#/components/schemas/FormProgram/enum",keyword:"enum",params:{allowedValues: schema58.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.kind !== undefined){
let data3 = data.kind;
if(typeof data3 !== "string"){
const err14 = {instancePath:instancePath+"/kind",schemaPath:"#/components/schemas/FormKind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(!((((((data3 === "musician_application") || (data3 === "technician_application")) || (data3 === "church_request")) || (data3 === "production_request")) || (data3 === "contact")) || (data3 === "partner_interest"))){
const err15 = {instancePath:instancePath+"/kind",schemaPath:"#/components/schemas/FormKind/enum",keyword:"enum",params:{allowedValues: schema59.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.title !== undefined){
if(typeof data.title !== "string"){
const err16 = {instancePath:instancePath+"/title",schemaPath:"#/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data.status !== undefined){
let data5 = data.status;
if(typeof data5 !== "string"){
const err17 = {instancePath:instancePath+"/status",schemaPath:"#/components/schemas/FormStatus/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if(!(((data5 === "draft") || (data5 === "published")) || (data5 === "closed"))){
const err18 = {instancePath:instancePath+"/status",schemaPath:"#/components/schemas/FormStatus/enum",keyword:"enum",params:{allowedValues: schema60.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.currentVersion !== undefined){
let data6 = data.currentVersion;
if((!((typeof data6 == "number") && (!(data6 % 1) && !isNaN(data6)))) && (data6 !== null)){
const err19 = {instancePath:instancePath+"/currentVersion",schemaPath:"#/properties/currentVersion/type",keyword:"type",params:{type: schema86.properties.currentVersion.type},message:"must be integer,null"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if(typeof data6 == "number"){
if(data6 < 1 || isNaN(data6)){
const err20 = {instancePath:instancePath+"/currentVersion",schemaPath:"#/properties/currentVersion/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
}
if(data.updatedAt !== undefined){
let data7 = data.updatedAt;
if(typeof data7 === "string"){
if(!(formats0.validate(data7))){
const err21 = {instancePath:instancePath+"/updatedAt",schemaPath:"#/components/schemas/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
else {
const err22 = {instancePath:instancePath+"/updatedAt",schemaPath:"#/components/schemas/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
}
else {
const err23 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
validate48.errors = vErrors;
return errors === 0;
}
validate48.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate47(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_FormListResponse" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate47.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.success === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "success"},message:"must have required property '"+"success"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.data === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "data"},message:"must have required property '"+"data"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "success") || (key0 === "data"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.success !== undefined){
if(true !== data.success){
const err3 = {instancePath:instancePath+"/success",schemaPath:"#/properties/success/const",keyword:"const",params:{allowedValue: true},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.data !== undefined){
let data1 = data.data;
if(Array.isArray(data1)){
const len0 = data1.length;
for(let i0=0; i0<len0; i0++){
if(!(validate48(data1[i0], {instancePath:instancePath+"/data/" + i0,parentData:data1,parentDataProperty:i0,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate48.errors : vErrors.concat(validate48.errors);
errors = vErrors.length;
}
}
}
else {
const err4 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
}
else {
const err5 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
validate47.errors = vErrors;
return errors === 0;
}
validate47.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_PublishFormResponse = validate50;
const schema92 = {"$id":"schema_PublishFormResponse","type":"object","additionalProperties":false,"properties":{"success":{"const":true},"data":{"type":"object","additionalProperties":false,"properties":{"formId":{"$ref":"gamo#/components/schemas/Identifier"},"versionId":{"$ref":"gamo#/components/schemas/Identifier"},"version":{"type":"integer","minimum":1}},"required":["formId","versionId","version"]}},"required":["success","data"]};

function validate50(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_PublishFormResponse" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate50.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.success === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "success"},message:"must have required property '"+"success"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.data === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "data"},message:"must have required property '"+"data"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "success") || (key0 === "data"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.success !== undefined){
if(true !== data.success){
const err3 = {instancePath:instancePath+"/success",schemaPath:"#/properties/success/const",keyword:"const",params:{allowedValue: true},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.data !== undefined){
let data1 = data.data;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.formId === undefined){
const err4 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/required",keyword:"required",params:{missingProperty: "formId"},message:"must have required property '"+"formId"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data1.versionId === undefined){
const err5 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/required",keyword:"required",params:{missingProperty: "versionId"},message:"must have required property '"+"versionId"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data1.version === undefined){
const err6 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/required",keyword:"required",params:{missingProperty: "version"},message:"must have required property '"+"version"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
for(const key1 in data1){
if(!(((key1 === "formId") || (key1 === "versionId")) || (key1 === "version"))){
const err7 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data1.formId !== undefined){
let data2 = data1.formId;
if(typeof data2 === "string"){
if(func1(data2) < 1){
const err8 = {instancePath:instancePath+"/data/formId",schemaPath:"gamo#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
else {
const err9 = {instancePath:instancePath+"/data/formId",schemaPath:"gamo#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data1.versionId !== undefined){
let data3 = data1.versionId;
if(typeof data3 === "string"){
if(func1(data3) < 1){
const err10 = {instancePath:instancePath+"/data/versionId",schemaPath:"gamo#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
else {
const err11 = {instancePath:instancePath+"/data/versionId",schemaPath:"gamo#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data1.version !== undefined){
let data4 = data1.version;
if(!((typeof data4 == "number") && (!(data4 % 1) && !isNaN(data4)))){
const err12 = {instancePath:instancePath+"/data/version",schemaPath:"#/properties/data/properties/version/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(typeof data4 == "number"){
if(data4 < 1 || isNaN(data4)){
const err13 = {instancePath:instancePath+"/data/version",schemaPath:"#/properties/data/properties/version/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
}
}
else {
const err14 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
}
else {
const err15 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
validate50.errors = vErrors;
return errors === 0;
}
validate50.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_FormUploadSummary = validate51;
const schema95 = {"$id":"schema_FormUploadSummary","type":"object","additionalProperties":false,"properties":{"id":{"$ref":"gamo#/components/schemas/Identifier"},"questionId":{"type":"string"},"kind":{"type":"string","enum":["image","video","pdf","other"]},"filename":{"type":"string"},"contentType":{"type":"string"},"bytes":{"type":"integer","minimum":0},"status":{"type":"string","enum":["pending","verified","rejected"]}},"required":["id","questionId","kind","filename","contentType","bytes","status"]};

function validate51(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_FormUploadSummary" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate51.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.questionId === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "questionId"},message:"must have required property '"+"questionId"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.kind === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.filename === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "filename"},message:"must have required property '"+"filename"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.contentType === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "contentType"},message:"must have required property '"+"contentType"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.bytes === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "bytes"},message:"must have required property '"+"bytes"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.status === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
for(const key0 in data){
if(!(((((((key0 === "id") || (key0 === "questionId")) || (key0 === "kind")) || (key0 === "filename")) || (key0 === "contentType")) || (key0 === "bytes")) || (key0 === "status"))){
const err7 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.id !== undefined){
let data0 = data.id;
if(typeof data0 === "string"){
if(func1(data0) < 1){
const err8 = {instancePath:instancePath+"/id",schemaPath:"gamo#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
else {
const err9 = {instancePath:instancePath+"/id",schemaPath:"gamo#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.questionId !== undefined){
if(typeof data.questionId !== "string"){
const err10 = {instancePath:instancePath+"/questionId",schemaPath:"#/properties/questionId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.kind !== undefined){
let data2 = data.kind;
if(typeof data2 !== "string"){
const err11 = {instancePath:instancePath+"/kind",schemaPath:"#/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(!((((data2 === "image") || (data2 === "video")) || (data2 === "pdf")) || (data2 === "other"))){
const err12 = {instancePath:instancePath+"/kind",schemaPath:"#/properties/kind/enum",keyword:"enum",params:{allowedValues: schema95.properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.filename !== undefined){
if(typeof data.filename !== "string"){
const err13 = {instancePath:instancePath+"/filename",schemaPath:"#/properties/filename/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.contentType !== undefined){
if(typeof data.contentType !== "string"){
const err14 = {instancePath:instancePath+"/contentType",schemaPath:"#/properties/contentType/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.bytes !== undefined){
let data5 = data.bytes;
if(!((typeof data5 == "number") && (!(data5 % 1) && !isNaN(data5)))){
const err15 = {instancePath:instancePath+"/bytes",schemaPath:"#/properties/bytes/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if(typeof data5 == "number"){
if(data5 < 0 || isNaN(data5)){
const err16 = {instancePath:instancePath+"/bytes",schemaPath:"#/properties/bytes/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
}
if(data.status !== undefined){
let data6 = data.status;
if(typeof data6 !== "string"){
const err17 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if(!(((data6 === "pending") || (data6 === "verified")) || (data6 === "rejected"))){
const err18 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/enum",keyword:"enum",params:{allowedValues: schema95.properties.status.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
}
else {
const err19 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
validate51.errors = vErrors;
return errors === 0;
}
validate51.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_SubmissionSummary = validate52;
const schema97 = {"$id":"schema_SubmissionSummary","type":"object","additionalProperties":false,"properties":{"id":{"$ref":"gamo#/components/schemas/Identifier"},"reference":{"type":"string","description":"Human reference such as GW-2026-0001 (GW worship, GP production, GS web)."},"formId":{"$ref":"gamo#/components/schemas/Identifier"},"formTitle":{"type":"string"},"kind":{"$ref":"gamo#/components/schemas/FormKind"},"status":{"$ref":"gamo#/components/schemas/SubmissionStatus"},"submitterName":{"type":["string","null"]},"submitterEmail":{"type":["string","null"],"format":"email"},"submittedAt":{"$ref":"gamo#/components/schemas/Timestamp"}},"required":["id","reference","formId","formTitle","kind","status","submittedAt"]};
const schema101 = {"type":"string","enum":["new","in_review","approved","declined","closed"]};

function validate52(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_SubmissionSummary" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate52.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.reference === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "reference"},message:"must have required property '"+"reference"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.formId === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "formId"},message:"must have required property '"+"formId"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.formTitle === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "formTitle"},message:"must have required property '"+"formTitle"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.kind === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.status === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.submittedAt === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "submittedAt"},message:"must have required property '"+"submittedAt"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
for(const key0 in data){
if(!(func11.call(schema97.properties, key0))){
const err7 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.id !== undefined){
let data0 = data.id;
if(typeof data0 === "string"){
if(func1(data0) < 1){
const err8 = {instancePath:instancePath+"/id",schemaPath:"gamo#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
else {
const err9 = {instancePath:instancePath+"/id",schemaPath:"gamo#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.reference !== undefined){
if(typeof data.reference !== "string"){
const err10 = {instancePath:instancePath+"/reference",schemaPath:"#/properties/reference/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.formId !== undefined){
let data2 = data.formId;
if(typeof data2 === "string"){
if(func1(data2) < 1){
const err11 = {instancePath:instancePath+"/formId",schemaPath:"gamo#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
else {
const err12 = {instancePath:instancePath+"/formId",schemaPath:"gamo#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.formTitle !== undefined){
if(typeof data.formTitle !== "string"){
const err13 = {instancePath:instancePath+"/formTitle",schemaPath:"#/properties/formTitle/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.kind !== undefined){
let data4 = data.kind;
if(typeof data4 !== "string"){
const err14 = {instancePath:instancePath+"/kind",schemaPath:"gamo#/components/schemas/FormKind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(!((((((data4 === "musician_application") || (data4 === "technician_application")) || (data4 === "church_request")) || (data4 === "production_request")) || (data4 === "contact")) || (data4 === "partner_interest"))){
const err15 = {instancePath:instancePath+"/kind",schemaPath:"gamo#/components/schemas/FormKind/enum",keyword:"enum",params:{allowedValues: schema59.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.status !== undefined){
let data5 = data.status;
if(typeof data5 !== "string"){
const err16 = {instancePath:instancePath+"/status",schemaPath:"gamo#/components/schemas/SubmissionStatus/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if(!(((((data5 === "new") || (data5 === "in_review")) || (data5 === "approved")) || (data5 === "declined")) || (data5 === "closed"))){
const err17 = {instancePath:instancePath+"/status",schemaPath:"gamo#/components/schemas/SubmissionStatus/enum",keyword:"enum",params:{allowedValues: schema101.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data.submitterName !== undefined){
let data6 = data.submitterName;
if((typeof data6 !== "string") && (data6 !== null)){
const err18 = {instancePath:instancePath+"/submitterName",schemaPath:"#/properties/submitterName/type",keyword:"type",params:{type: schema97.properties.submitterName.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.submitterEmail !== undefined){
let data7 = data.submitterEmail;
if((typeof data7 !== "string") && (data7 !== null)){
const err19 = {instancePath:instancePath+"/submitterEmail",schemaPath:"#/properties/submitterEmail/type",keyword:"type",params:{type: schema97.properties.submitterEmail.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if(typeof data7 === "string"){
if(!(formats6.test(data7))){
const err20 = {instancePath:instancePath+"/submitterEmail",schemaPath:"#/properties/submitterEmail/format",keyword:"format",params:{format: "email"},message:"must match format \""+"email"+"\""};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
}
if(data.submittedAt !== undefined){
let data8 = data.submittedAt;
if(typeof data8 === "string"){
if(!(formats0.validate(data8))){
const err21 = {instancePath:instancePath+"/submittedAt",schemaPath:"gamo#/components/schemas/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
else {
const err22 = {instancePath:instancePath+"/submittedAt",schemaPath:"gamo#/components/schemas/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
}
else {
const err23 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
validate52.errors = vErrors;
return errors === 0;
}
validate52.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_SubmissionDetail = validate53;
const schema103 = {"$id":"schema_SubmissionDetail","type":"object","additionalProperties":false,"properties":{"id":{"$ref":"gamo#/components/schemas/Identifier"},"reference":{"type":"string"},"formId":{"$ref":"gamo#/components/schemas/Identifier"},"formVersionId":{"$ref":"gamo#/components/schemas/Identifier"},"kind":{"$ref":"gamo#/components/schemas/FormKind"},"status":{"$ref":"gamo#/components/schemas/SubmissionStatus"},"submitterName":{"type":["string","null"]},"submitterEmail":{"type":["string","null"],"format":"email"},"submitterPhone":{"type":["string","null"]},"schema":{"$ref":"gamo#/components/schemas/FormSchema","description":"The form version the applicant answered, so removed questions still render."},"answers":{"type":"object","additionalProperties":true,"description":"Answers keyed by question id."},"binds":{"type":"object","additionalProperties":true,"description":"Values extracted through bind keys (contact.*, roster.*, request.*)."},"uploads":{"type":"array","items":{"$ref":"gamo#/components/schemas/FormUploadSummary"}},"staffNotes":{"type":["string","null"]},"submittedAt":{"$ref":"gamo#/components/schemas/Timestamp"},"reviewedAt":{"oneOf":[{"$ref":"gamo#/components/schemas/Timestamp"},{"type":"null"}]}},"required":["id","reference","formId","formVersionId","kind","status","schema","answers","uploads","submittedAt"]};
const schema110 = {"type":"object","additionalProperties":false,"properties":{"id":{"$ref":"#/components/schemas/Identifier"},"questionId":{"type":"string"},"kind":{"type":"string","enum":["image","video","pdf","other"]},"filename":{"type":"string"},"contentType":{"type":"string"},"bytes":{"type":"integer","minimum":0},"status":{"type":"string","enum":["pending","verified","rejected"]}},"required":["id","questionId","kind","filename","contentType","bytes","status"]};

function validate54(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate54.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.questionId === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "questionId"},message:"must have required property '"+"questionId"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.kind === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.filename === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "filename"},message:"must have required property '"+"filename"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.contentType === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "contentType"},message:"must have required property '"+"contentType"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.bytes === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "bytes"},message:"must have required property '"+"bytes"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.status === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
for(const key0 in data){
if(!(((((((key0 === "id") || (key0 === "questionId")) || (key0 === "kind")) || (key0 === "filename")) || (key0 === "contentType")) || (key0 === "bytes")) || (key0 === "status"))){
const err7 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.id !== undefined){
let data0 = data.id;
if(typeof data0 === "string"){
if(func1(data0) < 1){
const err8 = {instancePath:instancePath+"/id",schemaPath:"#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
else {
const err9 = {instancePath:instancePath+"/id",schemaPath:"#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.questionId !== undefined){
if(typeof data.questionId !== "string"){
const err10 = {instancePath:instancePath+"/questionId",schemaPath:"#/properties/questionId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.kind !== undefined){
let data2 = data.kind;
if(typeof data2 !== "string"){
const err11 = {instancePath:instancePath+"/kind",schemaPath:"#/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(!((((data2 === "image") || (data2 === "video")) || (data2 === "pdf")) || (data2 === "other"))){
const err12 = {instancePath:instancePath+"/kind",schemaPath:"#/properties/kind/enum",keyword:"enum",params:{allowedValues: schema110.properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.filename !== undefined){
if(typeof data.filename !== "string"){
const err13 = {instancePath:instancePath+"/filename",schemaPath:"#/properties/filename/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.contentType !== undefined){
if(typeof data.contentType !== "string"){
const err14 = {instancePath:instancePath+"/contentType",schemaPath:"#/properties/contentType/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.bytes !== undefined){
let data5 = data.bytes;
if(!((typeof data5 == "number") && (!(data5 % 1) && !isNaN(data5)))){
const err15 = {instancePath:instancePath+"/bytes",schemaPath:"#/properties/bytes/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if(typeof data5 == "number"){
if(data5 < 0 || isNaN(data5)){
const err16 = {instancePath:instancePath+"/bytes",schemaPath:"#/properties/bytes/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
}
if(data.status !== undefined){
let data6 = data.status;
if(typeof data6 !== "string"){
const err17 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if(!(((data6 === "pending") || (data6 === "verified")) || (data6 === "rejected"))){
const err18 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/enum",keyword:"enum",params:{allowedValues: schema110.properties.status.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
}
else {
const err19 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
validate54.errors = vErrors;
return errors === 0;
}
validate54.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate53(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_SubmissionDetail" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate53.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.reference === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "reference"},message:"must have required property '"+"reference"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.formId === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "formId"},message:"must have required property '"+"formId"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.formVersionId === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "formVersionId"},message:"must have required property '"+"formVersionId"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.kind === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.status === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.schema === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "schema"},message:"must have required property '"+"schema"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.answers === undefined){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "answers"},message:"must have required property '"+"answers"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data.uploads === undefined){
const err8 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "uploads"},message:"must have required property '"+"uploads"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(data.submittedAt === undefined){
const err9 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "submittedAt"},message:"must have required property '"+"submittedAt"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
for(const key0 in data){
if(!(func11.call(schema103.properties, key0))){
const err10 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.id !== undefined){
let data0 = data.id;
if(typeof data0 === "string"){
if(func1(data0) < 1){
const err11 = {instancePath:instancePath+"/id",schemaPath:"gamo#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
else {
const err12 = {instancePath:instancePath+"/id",schemaPath:"gamo#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.reference !== undefined){
if(typeof data.reference !== "string"){
const err13 = {instancePath:instancePath+"/reference",schemaPath:"#/properties/reference/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.formId !== undefined){
let data2 = data.formId;
if(typeof data2 === "string"){
if(func1(data2) < 1){
const err14 = {instancePath:instancePath+"/formId",schemaPath:"gamo#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
else {
const err15 = {instancePath:instancePath+"/formId",schemaPath:"gamo#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.formVersionId !== undefined){
let data3 = data.formVersionId;
if(typeof data3 === "string"){
if(func1(data3) < 1){
const err16 = {instancePath:instancePath+"/formVersionId",schemaPath:"gamo#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
else {
const err17 = {instancePath:instancePath+"/formVersionId",schemaPath:"gamo#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data.kind !== undefined){
let data4 = data.kind;
if(typeof data4 !== "string"){
const err18 = {instancePath:instancePath+"/kind",schemaPath:"gamo#/components/schemas/FormKind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
if(!((((((data4 === "musician_application") || (data4 === "technician_application")) || (data4 === "church_request")) || (data4 === "production_request")) || (data4 === "contact")) || (data4 === "partner_interest"))){
const err19 = {instancePath:instancePath+"/kind",schemaPath:"gamo#/components/schemas/FormKind/enum",keyword:"enum",params:{allowedValues: schema59.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
if(data.status !== undefined){
let data5 = data.status;
if(typeof data5 !== "string"){
const err20 = {instancePath:instancePath+"/status",schemaPath:"gamo#/components/schemas/SubmissionStatus/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
if(!(((((data5 === "new") || (data5 === "in_review")) || (data5 === "approved")) || (data5 === "declined")) || (data5 === "closed"))){
const err21 = {instancePath:instancePath+"/status",schemaPath:"gamo#/components/schemas/SubmissionStatus/enum",keyword:"enum",params:{allowedValues: schema101.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data.submitterName !== undefined){
let data6 = data.submitterName;
if((typeof data6 !== "string") && (data6 !== null)){
const err22 = {instancePath:instancePath+"/submitterName",schemaPath:"#/properties/submitterName/type",keyword:"type",params:{type: schema103.properties.submitterName.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
if(data.submitterEmail !== undefined){
let data7 = data.submitterEmail;
if((typeof data7 !== "string") && (data7 !== null)){
const err23 = {instancePath:instancePath+"/submitterEmail",schemaPath:"#/properties/submitterEmail/type",keyword:"type",params:{type: schema103.properties.submitterEmail.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
if(typeof data7 === "string"){
if(!(formats6.test(data7))){
const err24 = {instancePath:instancePath+"/submitterEmail",schemaPath:"#/properties/submitterEmail/format",keyword:"format",params:{format: "email"},message:"must match format \""+"email"+"\""};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
}
if(data.submitterPhone !== undefined){
let data8 = data.submitterPhone;
if((typeof data8 !== "string") && (data8 !== null)){
const err25 = {instancePath:instancePath+"/submitterPhone",schemaPath:"#/properties/submitterPhone/type",keyword:"type",params:{type: schema103.properties.submitterPhone.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
if(data.schema !== undefined){
let data9 = data.schema;
if(data9 && typeof data9 == "object" && !Array.isArray(data9)){
}
else {
const err26 = {instancePath:instancePath+"/schema",schemaPath:"gamo#/components/schemas/FormSchema/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
if(data.answers !== undefined){
let data10 = data.answers;
if(data10 && typeof data10 == "object" && !Array.isArray(data10)){
}
else {
const err27 = {instancePath:instancePath+"/answers",schemaPath:"#/properties/answers/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
if(data.binds !== undefined){
let data11 = data.binds;
if(data11 && typeof data11 == "object" && !Array.isArray(data11)){
}
else {
const err28 = {instancePath:instancePath+"/binds",schemaPath:"#/properties/binds/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
if(data.uploads !== undefined){
let data12 = data.uploads;
if(Array.isArray(data12)){
const len0 = data12.length;
for(let i0=0; i0<len0; i0++){
if(!(validate54(data12[i0], {instancePath:instancePath+"/uploads/" + i0,parentData:data12,parentDataProperty:i0,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate54.errors : vErrors.concat(validate54.errors);
errors = vErrors.length;
}
}
}
else {
const err29 = {instancePath:instancePath+"/uploads",schemaPath:"#/properties/uploads/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
if(data.staffNotes !== undefined){
let data14 = data.staffNotes;
if((typeof data14 !== "string") && (data14 !== null)){
const err30 = {instancePath:instancePath+"/staffNotes",schemaPath:"#/properties/staffNotes/type",keyword:"type",params:{type: schema103.properties.staffNotes.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
if(data.submittedAt !== undefined){
let data15 = data.submittedAt;
if(typeof data15 === "string"){
if(!(formats0.validate(data15))){
const err31 = {instancePath:instancePath+"/submittedAt",schemaPath:"gamo#/components/schemas/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
else {
const err32 = {instancePath:instancePath+"/submittedAt",schemaPath:"gamo#/components/schemas/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
if(data.reviewedAt !== undefined){
let data16 = data.reviewedAt;
const _errs45 = errors;
let valid10 = false;
let passing0 = null;
const _errs46 = errors;
if(typeof data16 === "string"){
if(!(formats0.validate(data16))){
const err33 = {instancePath:instancePath+"/reviewedAt",schemaPath:"gamo#/components/schemas/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
else {
const err34 = {instancePath:instancePath+"/reviewedAt",schemaPath:"gamo#/components/schemas/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
var _valid0 = _errs46 === errors;
if(_valid0){
valid10 = true;
passing0 = 0;
}
const _errs49 = errors;
if(data16 !== null){
const err35 = {instancePath:instancePath+"/reviewedAt",schemaPath:"#/properties/reviewedAt/oneOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
var _valid0 = _errs49 === errors;
if(_valid0 && valid10){
valid10 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid10 = true;
passing0 = 1;
}
}
if(!valid10){
const err36 = {instancePath:instancePath+"/reviewedAt",schemaPath:"#/properties/reviewedAt/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
else {
errors = _errs45;
if(vErrors !== null){
if(_errs45){
vErrors.length = _errs45;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err37 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
validate53.errors = vErrors;
return errors === 0;
}
validate53.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_SubmissionListResponse = validate56;
const schema114 = {"$id":"schema_SubmissionListResponse","type":"object","additionalProperties":false,"properties":{"success":{"const":true},"data":{"type":"array","items":{"$ref":"gamo#/components/schemas/SubmissionSummary"}},"meta":{"$ref":"gamo#/components/schemas/CursorMeta"}},"required":["success","data"]};
const schema121 = {"type":"object","additionalProperties":false,"properties":{"nextCursor":{"type":["string","null"],"description":"Opaque keyset cursor scoped to the filters; null on the last page."}},"required":["nextCursor"]};
const schema115 = {"type":"object","additionalProperties":false,"properties":{"id":{"$ref":"#/components/schemas/Identifier"},"reference":{"type":"string","description":"Human reference such as GW-2026-0001 (GW worship, GP production, GS web)."},"formId":{"$ref":"#/components/schemas/Identifier"},"formTitle":{"type":"string"},"kind":{"$ref":"#/components/schemas/FormKind"},"status":{"$ref":"#/components/schemas/SubmissionStatus"},"submitterName":{"type":["string","null"]},"submitterEmail":{"type":["string","null"],"format":"email"},"submittedAt":{"$ref":"#/components/schemas/Timestamp"}},"required":["id","reference","formId","formTitle","kind","status","submittedAt"]};

function validate57(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate57.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.reference === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "reference"},message:"must have required property '"+"reference"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.formId === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "formId"},message:"must have required property '"+"formId"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.formTitle === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "formTitle"},message:"must have required property '"+"formTitle"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.kind === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.status === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.submittedAt === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "submittedAt"},message:"must have required property '"+"submittedAt"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
for(const key0 in data){
if(!(func11.call(schema115.properties, key0))){
const err7 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.id !== undefined){
let data0 = data.id;
if(typeof data0 === "string"){
if(func1(data0) < 1){
const err8 = {instancePath:instancePath+"/id",schemaPath:"#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
else {
const err9 = {instancePath:instancePath+"/id",schemaPath:"#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.reference !== undefined){
if(typeof data.reference !== "string"){
const err10 = {instancePath:instancePath+"/reference",schemaPath:"#/properties/reference/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.formId !== undefined){
let data2 = data.formId;
if(typeof data2 === "string"){
if(func1(data2) < 1){
const err11 = {instancePath:instancePath+"/formId",schemaPath:"#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
else {
const err12 = {instancePath:instancePath+"/formId",schemaPath:"#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.formTitle !== undefined){
if(typeof data.formTitle !== "string"){
const err13 = {instancePath:instancePath+"/formTitle",schemaPath:"#/properties/formTitle/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.kind !== undefined){
let data4 = data.kind;
if(typeof data4 !== "string"){
const err14 = {instancePath:instancePath+"/kind",schemaPath:"#/components/schemas/FormKind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(!((((((data4 === "musician_application") || (data4 === "technician_application")) || (data4 === "church_request")) || (data4 === "production_request")) || (data4 === "contact")) || (data4 === "partner_interest"))){
const err15 = {instancePath:instancePath+"/kind",schemaPath:"#/components/schemas/FormKind/enum",keyword:"enum",params:{allowedValues: schema59.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.status !== undefined){
let data5 = data.status;
if(typeof data5 !== "string"){
const err16 = {instancePath:instancePath+"/status",schemaPath:"#/components/schemas/SubmissionStatus/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if(!(((((data5 === "new") || (data5 === "in_review")) || (data5 === "approved")) || (data5 === "declined")) || (data5 === "closed"))){
const err17 = {instancePath:instancePath+"/status",schemaPath:"#/components/schemas/SubmissionStatus/enum",keyword:"enum",params:{allowedValues: schema101.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data.submitterName !== undefined){
let data6 = data.submitterName;
if((typeof data6 !== "string") && (data6 !== null)){
const err18 = {instancePath:instancePath+"/submitterName",schemaPath:"#/properties/submitterName/type",keyword:"type",params:{type: schema115.properties.submitterName.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.submitterEmail !== undefined){
let data7 = data.submitterEmail;
if((typeof data7 !== "string") && (data7 !== null)){
const err19 = {instancePath:instancePath+"/submitterEmail",schemaPath:"#/properties/submitterEmail/type",keyword:"type",params:{type: schema115.properties.submitterEmail.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if(typeof data7 === "string"){
if(!(formats6.test(data7))){
const err20 = {instancePath:instancePath+"/submitterEmail",schemaPath:"#/properties/submitterEmail/format",keyword:"format",params:{format: "email"},message:"must match format \""+"email"+"\""};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
}
if(data.submittedAt !== undefined){
let data8 = data.submittedAt;
if(typeof data8 === "string"){
if(!(formats0.validate(data8))){
const err21 = {instancePath:instancePath+"/submittedAt",schemaPath:"#/components/schemas/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
else {
const err22 = {instancePath:instancePath+"/submittedAt",schemaPath:"#/components/schemas/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
}
else {
const err23 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
validate57.errors = vErrors;
return errors === 0;
}
validate57.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate56(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_SubmissionListResponse" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate56.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.success === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "success"},message:"must have required property '"+"success"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.data === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "data"},message:"must have required property '"+"data"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!(((key0 === "success") || (key0 === "data")) || (key0 === "meta"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.success !== undefined){
if(true !== data.success){
const err3 = {instancePath:instancePath+"/success",schemaPath:"#/properties/success/const",keyword:"const",params:{allowedValue: true},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.data !== undefined){
let data1 = data.data;
if(Array.isArray(data1)){
const len0 = data1.length;
for(let i0=0; i0<len0; i0++){
if(!(validate57(data1[i0], {instancePath:instancePath+"/data/" + i0,parentData:data1,parentDataProperty:i0,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate57.errors : vErrors.concat(validate57.errors);
errors = vErrors.length;
}
}
}
else {
const err4 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.meta !== undefined){
let data3 = data.meta;
if(data3 && typeof data3 == "object" && !Array.isArray(data3)){
if(data3.nextCursor === undefined){
const err5 = {instancePath:instancePath+"/meta",schemaPath:"gamo#/components/schemas/CursorMeta/required",keyword:"required",params:{missingProperty: "nextCursor"},message:"must have required property '"+"nextCursor"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
for(const key1 in data3){
if(!(key1 === "nextCursor")){
const err6 = {instancePath:instancePath+"/meta",schemaPath:"gamo#/components/schemas/CursorMeta/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data3.nextCursor !== undefined){
let data4 = data3.nextCursor;
if((typeof data4 !== "string") && (data4 !== null)){
const err7 = {instancePath:instancePath+"/meta/nextCursor",schemaPath:"gamo#/components/schemas/CursorMeta/properties/nextCursor/type",keyword:"type",params:{type: schema121.properties.nextCursor.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
}
else {
const err8 = {instancePath:instancePath+"/meta",schemaPath:"gamo#/components/schemas/CursorMeta/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
}
else {
const err9 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
validate56.errors = vErrors;
return errors === 0;
}
validate56.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_SubmissionResponse = validate59;
const schema122 = {"$id":"schema_SubmissionResponse","type":"object","additionalProperties":false,"properties":{"success":{"const":true},"data":{"$ref":"gamo#/components/schemas/SubmissionDetail"}},"required":["success","data"]};
const schema123 = {"type":"object","additionalProperties":false,"properties":{"id":{"$ref":"#/components/schemas/Identifier"},"reference":{"type":"string"},"formId":{"$ref":"#/components/schemas/Identifier"},"formVersionId":{"$ref":"#/components/schemas/Identifier"},"kind":{"$ref":"#/components/schemas/FormKind"},"status":{"$ref":"#/components/schemas/SubmissionStatus"},"submitterName":{"type":["string","null"]},"submitterEmail":{"type":["string","null"],"format":"email"},"submitterPhone":{"type":["string","null"]},"schema":{"$ref":"#/components/schemas/FormSchema","description":"The form version the applicant answered, so removed questions still render."},"answers":{"type":"object","additionalProperties":true,"description":"Answers keyed by question id."},"binds":{"type":"object","additionalProperties":true,"description":"Values extracted through bind keys (contact.*, roster.*, request.*)."},"uploads":{"type":"array","items":{"$ref":"#/components/schemas/FormUploadSummary"}},"staffNotes":{"type":["string","null"]},"submittedAt":{"$ref":"#/components/schemas/Timestamp"},"reviewedAt":{"oneOf":[{"$ref":"#/components/schemas/Timestamp"},{"type":"null"}]}},"required":["id","reference","formId","formVersionId","kind","status","schema","answers","uploads","submittedAt"]};

function validate61(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate61.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.questionId === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "questionId"},message:"must have required property '"+"questionId"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.kind === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.filename === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "filename"},message:"must have required property '"+"filename"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.contentType === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "contentType"},message:"must have required property '"+"contentType"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.bytes === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "bytes"},message:"must have required property '"+"bytes"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.status === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
for(const key0 in data){
if(!(((((((key0 === "id") || (key0 === "questionId")) || (key0 === "kind")) || (key0 === "filename")) || (key0 === "contentType")) || (key0 === "bytes")) || (key0 === "status"))){
const err7 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.id !== undefined){
let data0 = data.id;
if(typeof data0 === "string"){
if(func1(data0) < 1){
const err8 = {instancePath:instancePath+"/id",schemaPath:"#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
else {
const err9 = {instancePath:instancePath+"/id",schemaPath:"#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.questionId !== undefined){
if(typeof data.questionId !== "string"){
const err10 = {instancePath:instancePath+"/questionId",schemaPath:"#/properties/questionId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.kind !== undefined){
let data2 = data.kind;
if(typeof data2 !== "string"){
const err11 = {instancePath:instancePath+"/kind",schemaPath:"#/properties/kind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(!((((data2 === "image") || (data2 === "video")) || (data2 === "pdf")) || (data2 === "other"))){
const err12 = {instancePath:instancePath+"/kind",schemaPath:"#/properties/kind/enum",keyword:"enum",params:{allowedValues: schema110.properties.kind.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.filename !== undefined){
if(typeof data.filename !== "string"){
const err13 = {instancePath:instancePath+"/filename",schemaPath:"#/properties/filename/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.contentType !== undefined){
if(typeof data.contentType !== "string"){
const err14 = {instancePath:instancePath+"/contentType",schemaPath:"#/properties/contentType/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.bytes !== undefined){
let data5 = data.bytes;
if(!((typeof data5 == "number") && (!(data5 % 1) && !isNaN(data5)))){
const err15 = {instancePath:instancePath+"/bytes",schemaPath:"#/properties/bytes/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if(typeof data5 == "number"){
if(data5 < 0 || isNaN(data5)){
const err16 = {instancePath:instancePath+"/bytes",schemaPath:"#/properties/bytes/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
}
if(data.status !== undefined){
let data6 = data.status;
if(typeof data6 !== "string"){
const err17 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if(!(((data6 === "pending") || (data6 === "verified")) || (data6 === "rejected"))){
const err18 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/enum",keyword:"enum",params:{allowedValues: schema110.properties.status.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
}
else {
const err19 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
validate61.errors = vErrors;
return errors === 0;
}
validate61.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate60(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate60.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.reference === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "reference"},message:"must have required property '"+"reference"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.formId === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "formId"},message:"must have required property '"+"formId"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.formVersionId === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "formVersionId"},message:"must have required property '"+"formVersionId"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.kind === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.status === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.schema === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "schema"},message:"must have required property '"+"schema"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.answers === undefined){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "answers"},message:"must have required property '"+"answers"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data.uploads === undefined){
const err8 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "uploads"},message:"must have required property '"+"uploads"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(data.submittedAt === undefined){
const err9 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "submittedAt"},message:"must have required property '"+"submittedAt"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
for(const key0 in data){
if(!(func11.call(schema123.properties, key0))){
const err10 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.id !== undefined){
let data0 = data.id;
if(typeof data0 === "string"){
if(func1(data0) < 1){
const err11 = {instancePath:instancePath+"/id",schemaPath:"#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
else {
const err12 = {instancePath:instancePath+"/id",schemaPath:"#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.reference !== undefined){
if(typeof data.reference !== "string"){
const err13 = {instancePath:instancePath+"/reference",schemaPath:"#/properties/reference/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.formId !== undefined){
let data2 = data.formId;
if(typeof data2 === "string"){
if(func1(data2) < 1){
const err14 = {instancePath:instancePath+"/formId",schemaPath:"#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
else {
const err15 = {instancePath:instancePath+"/formId",schemaPath:"#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.formVersionId !== undefined){
let data3 = data.formVersionId;
if(typeof data3 === "string"){
if(func1(data3) < 1){
const err16 = {instancePath:instancePath+"/formVersionId",schemaPath:"#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
else {
const err17 = {instancePath:instancePath+"/formVersionId",schemaPath:"#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data.kind !== undefined){
let data4 = data.kind;
if(typeof data4 !== "string"){
const err18 = {instancePath:instancePath+"/kind",schemaPath:"#/components/schemas/FormKind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
if(!((((((data4 === "musician_application") || (data4 === "technician_application")) || (data4 === "church_request")) || (data4 === "production_request")) || (data4 === "contact")) || (data4 === "partner_interest"))){
const err19 = {instancePath:instancePath+"/kind",schemaPath:"#/components/schemas/FormKind/enum",keyword:"enum",params:{allowedValues: schema59.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
if(data.status !== undefined){
let data5 = data.status;
if(typeof data5 !== "string"){
const err20 = {instancePath:instancePath+"/status",schemaPath:"#/components/schemas/SubmissionStatus/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
if(!(((((data5 === "new") || (data5 === "in_review")) || (data5 === "approved")) || (data5 === "declined")) || (data5 === "closed"))){
const err21 = {instancePath:instancePath+"/status",schemaPath:"#/components/schemas/SubmissionStatus/enum",keyword:"enum",params:{allowedValues: schema101.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data.submitterName !== undefined){
let data6 = data.submitterName;
if((typeof data6 !== "string") && (data6 !== null)){
const err22 = {instancePath:instancePath+"/submitterName",schemaPath:"#/properties/submitterName/type",keyword:"type",params:{type: schema123.properties.submitterName.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
if(data.submitterEmail !== undefined){
let data7 = data.submitterEmail;
if((typeof data7 !== "string") && (data7 !== null)){
const err23 = {instancePath:instancePath+"/submitterEmail",schemaPath:"#/properties/submitterEmail/type",keyword:"type",params:{type: schema123.properties.submitterEmail.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
if(typeof data7 === "string"){
if(!(formats6.test(data7))){
const err24 = {instancePath:instancePath+"/submitterEmail",schemaPath:"#/properties/submitterEmail/format",keyword:"format",params:{format: "email"},message:"must match format \""+"email"+"\""};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
}
if(data.submitterPhone !== undefined){
let data8 = data.submitterPhone;
if((typeof data8 !== "string") && (data8 !== null)){
const err25 = {instancePath:instancePath+"/submitterPhone",schemaPath:"#/properties/submitterPhone/type",keyword:"type",params:{type: schema123.properties.submitterPhone.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
if(data.schema !== undefined){
let data9 = data.schema;
if(data9 && typeof data9 == "object" && !Array.isArray(data9)){
}
else {
const err26 = {instancePath:instancePath+"/schema",schemaPath:"#/components/schemas/FormSchema/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
if(data.answers !== undefined){
let data10 = data.answers;
if(data10 && typeof data10 == "object" && !Array.isArray(data10)){
}
else {
const err27 = {instancePath:instancePath+"/answers",schemaPath:"#/properties/answers/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
if(data.binds !== undefined){
let data11 = data.binds;
if(data11 && typeof data11 == "object" && !Array.isArray(data11)){
}
else {
const err28 = {instancePath:instancePath+"/binds",schemaPath:"#/properties/binds/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
if(data.uploads !== undefined){
let data12 = data.uploads;
if(Array.isArray(data12)){
const len0 = data12.length;
for(let i0=0; i0<len0; i0++){
if(!(validate61(data12[i0], {instancePath:instancePath+"/uploads/" + i0,parentData:data12,parentDataProperty:i0,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate61.errors : vErrors.concat(validate61.errors);
errors = vErrors.length;
}
}
}
else {
const err29 = {instancePath:instancePath+"/uploads",schemaPath:"#/properties/uploads/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
if(data.staffNotes !== undefined){
let data14 = data.staffNotes;
if((typeof data14 !== "string") && (data14 !== null)){
const err30 = {instancePath:instancePath+"/staffNotes",schemaPath:"#/properties/staffNotes/type",keyword:"type",params:{type: schema123.properties.staffNotes.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
if(data.submittedAt !== undefined){
let data15 = data.submittedAt;
if(typeof data15 === "string"){
if(!(formats0.validate(data15))){
const err31 = {instancePath:instancePath+"/submittedAt",schemaPath:"#/components/schemas/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
else {
const err32 = {instancePath:instancePath+"/submittedAt",schemaPath:"#/components/schemas/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
if(data.reviewedAt !== undefined){
let data16 = data.reviewedAt;
const _errs45 = errors;
let valid10 = false;
let passing0 = null;
const _errs46 = errors;
if(typeof data16 === "string"){
if(!(formats0.validate(data16))){
const err33 = {instancePath:instancePath+"/reviewedAt",schemaPath:"#/components/schemas/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
else {
const err34 = {instancePath:instancePath+"/reviewedAt",schemaPath:"#/components/schemas/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
var _valid0 = _errs46 === errors;
if(_valid0){
valid10 = true;
passing0 = 0;
}
const _errs49 = errors;
if(data16 !== null){
const err35 = {instancePath:instancePath+"/reviewedAt",schemaPath:"#/properties/reviewedAt/oneOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
var _valid0 = _errs49 === errors;
if(_valid0 && valid10){
valid10 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid10 = true;
passing0 = 1;
}
}
if(!valid10){
const err36 = {instancePath:instancePath+"/reviewedAt",schemaPath:"#/properties/reviewedAt/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
else {
errors = _errs45;
if(vErrors !== null){
if(_errs45){
vErrors.length = _errs45;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err37 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
validate60.errors = vErrors;
return errors === 0;
}
validate60.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate59(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_SubmissionResponse" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate59.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.success === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "success"},message:"must have required property '"+"success"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.data === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "data"},message:"must have required property '"+"data"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "success") || (key0 === "data"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.success !== undefined){
if(true !== data.success){
const err3 = {instancePath:instancePath+"/success",schemaPath:"#/properties/success/const",keyword:"const",params:{allowedValue: true},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.data !== undefined){
if(!(validate60(data.data, {instancePath:instancePath+"/data",parentData:data,parentDataProperty:"data",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate60.errors : vErrors.concat(validate60.errors);
errors = vErrors.length;
}
}
}
else {
const err4 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
validate59.errors = vErrors;
return errors === 0;
}
validate59.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_SubmissionStatusInput = validate64;
const schema134 = {"$id":"schema_SubmissionStatusInput","type":"object","additionalProperties":false,"properties":{"status":{"type":"string","enum":["new","in_review","closed"],"description":"approved and declined are set only by the approve and decline actions."},"notes":{"type":"string","maxLength":4000}},"required":["status"]};

function validate64(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_SubmissionStatusInput" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate64.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.status === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "status") || (key0 === "notes"))){
const err1 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
if(data.status !== undefined){
let data0 = data.status;
if(typeof data0 !== "string"){
const err2 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(!(((data0 === "new") || (data0 === "in_review")) || (data0 === "closed"))){
const err3 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/enum",keyword:"enum",params:{allowedValues: schema134.properties.status.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.notes !== undefined){
let data1 = data.notes;
if(typeof data1 === "string"){
if(func1(data1) > 4000){
const err4 = {instancePath:instancePath+"/notes",schemaPath:"#/properties/notes/maxLength",keyword:"maxLength",params:{limit: 4000},message:"must NOT have more than 4000 characters"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
else {
const err5 = {instancePath:instancePath+"/notes",schemaPath:"#/properties/notes/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
}
else {
const err6 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
validate64.errors = vErrors;
return errors === 0;
}
validate64.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_SubmissionStatusResponse = validate65;
const schema135 = {"$id":"schema_SubmissionStatusResponse","type":"object","additionalProperties":false,"properties":{"success":{"const":true},"data":{"type":"object","additionalProperties":false,"properties":{"id":{"$ref":"gamo#/components/schemas/Identifier"},"status":{"$ref":"gamo#/components/schemas/SubmissionStatus"}},"required":["id","status"]}},"required":["success","data"]};

function validate65(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_SubmissionStatusResponse" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate65.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.success === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "success"},message:"must have required property '"+"success"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.data === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "data"},message:"must have required property '"+"data"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "success") || (key0 === "data"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.success !== undefined){
if(true !== data.success){
const err3 = {instancePath:instancePath+"/success",schemaPath:"#/properties/success/const",keyword:"const",params:{allowedValue: true},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.data !== undefined){
let data1 = data.data;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.id === undefined){
const err4 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data1.status === undefined){
const err5 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
for(const key1 in data1){
if(!((key1 === "id") || (key1 === "status"))){
const err6 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data1.id !== undefined){
let data2 = data1.id;
if(typeof data2 === "string"){
if(func1(data2) < 1){
const err7 = {instancePath:instancePath+"/data/id",schemaPath:"gamo#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/data/id",schemaPath:"gamo#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data1.status !== undefined){
let data3 = data1.status;
if(typeof data3 !== "string"){
const err9 = {instancePath:instancePath+"/data/status",schemaPath:"gamo#/components/schemas/SubmissionStatus/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(!(((((data3 === "new") || (data3 === "in_review")) || (data3 === "approved")) || (data3 === "declined")) || (data3 === "closed"))){
const err10 = {instancePath:instancePath+"/data/status",schemaPath:"gamo#/components/schemas/SubmissionStatus/enum",keyword:"enum",params:{allowedValues: schema101.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
}
else {
const err11 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
}
else {
const err12 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
validate65.errors = vErrors;
return errors === 0;
}
validate65.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_ApplicationDecisionInput = validate66;
const schema138 = {"$id":"schema_ApplicationDecisionInput","type":"object","additionalProperties":false,"properties":{"notes":{"type":"string","maxLength":4000}}};

function validate66(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_ApplicationDecisionInput" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate66.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
for(const key0 in data){
if(!(key0 === "notes")){
const err0 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
}
if(data.notes !== undefined){
let data0 = data.notes;
if(typeof data0 === "string"){
if(func1(data0) > 4000){
const err1 = {instancePath:instancePath+"/notes",schemaPath:"#/properties/notes/maxLength",keyword:"maxLength",params:{limit: 4000},message:"must NOT have more than 4000 characters"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
else {
const err2 = {instancePath:instancePath+"/notes",schemaPath:"#/properties/notes/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
}
else {
const err3 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
validate66.errors = vErrors;
return errors === 0;
}
validate66.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_ApplicationDecisionResponse = validate67;
const schema139 = {"$id":"schema_ApplicationDecisionResponse","type":"object","additionalProperties":false,"properties":{"success":{"const":true},"data":{"type":"object","additionalProperties":false,"properties":{"id":{"$ref":"gamo#/components/schemas/Identifier"},"status":{"type":"string","enum":["approved","declined"]},"rosterMemberId":{"oneOf":[{"$ref":"gamo#/components/schemas/Identifier"},{"type":"null"}],"description":"Set on approval; null on decline."},"changed":{"type":"boolean","description":"false when the submission was already decided (repeat is a no-op)."}},"required":["id","status","rosterMemberId","changed"]}},"required":["success","data"]};

function validate67(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_ApplicationDecisionResponse" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate67.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.success === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "success"},message:"must have required property '"+"success"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.data === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "data"},message:"must have required property '"+"data"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "success") || (key0 === "data"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.success !== undefined){
if(true !== data.success){
const err3 = {instancePath:instancePath+"/success",schemaPath:"#/properties/success/const",keyword:"const",params:{allowedValue: true},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.data !== undefined){
let data1 = data.data;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.id === undefined){
const err4 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data1.status === undefined){
const err5 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data1.rosterMemberId === undefined){
const err6 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/required",keyword:"required",params:{missingProperty: "rosterMemberId"},message:"must have required property '"+"rosterMemberId"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data1.changed === undefined){
const err7 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/required",keyword:"required",params:{missingProperty: "changed"},message:"must have required property '"+"changed"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
for(const key1 in data1){
if(!((((key1 === "id") || (key1 === "status")) || (key1 === "rosterMemberId")) || (key1 === "changed"))){
const err8 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data1.id !== undefined){
let data2 = data1.id;
if(typeof data2 === "string"){
if(func1(data2) < 1){
const err9 = {instancePath:instancePath+"/data/id",schemaPath:"gamo#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/data/id",schemaPath:"gamo#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data1.status !== undefined){
let data3 = data1.status;
if(typeof data3 !== "string"){
const err11 = {instancePath:instancePath+"/data/status",schemaPath:"#/properties/data/properties/status/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(!((data3 === "approved") || (data3 === "declined"))){
const err12 = {instancePath:instancePath+"/data/status",schemaPath:"#/properties/data/properties/status/enum",keyword:"enum",params:{allowedValues: schema139.properties.data.properties.status.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data1.rosterMemberId !== undefined){
let data4 = data1.rosterMemberId;
const _errs12 = errors;
let valid3 = false;
let passing0 = null;
const _errs13 = errors;
if(typeof data4 === "string"){
if(func1(data4) < 1){
const err13 = {instancePath:instancePath+"/data/rosterMemberId",schemaPath:"gamo#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
else {
const err14 = {instancePath:instancePath+"/data/rosterMemberId",schemaPath:"gamo#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
var _valid0 = _errs13 === errors;
if(_valid0){
valid3 = true;
passing0 = 0;
}
const _errs16 = errors;
if(data4 !== null){
const err15 = {instancePath:instancePath+"/data/rosterMemberId",schemaPath:"#/properties/data/properties/rosterMemberId/oneOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
var _valid0 = _errs16 === errors;
if(_valid0 && valid3){
valid3 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid3 = true;
passing0 = 1;
}
}
if(!valid3){
const err16 = {instancePath:instancePath+"/data/rosterMemberId",schemaPath:"#/properties/data/properties/rosterMemberId/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
else {
errors = _errs12;
if(vErrors !== null){
if(_errs12){
vErrors.length = _errs12;
}
else {
vErrors = null;
}
}
}
}
if(data1.changed !== undefined){
if(typeof data1.changed !== "boolean"){
const err17 = {instancePath:instancePath+"/data/changed",schemaPath:"#/properties/data/properties/changed/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
}
else {
const err18 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
}
else {
const err19 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
validate67.errors = vErrors;
return errors === 0;
}
validate67.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_UploadSessionInput = validate68;
const schema142 = {"$id":"schema_UploadSessionInput","type":"object","additionalProperties":false,"properties":{"turnstileToken":{"type":"string","minLength":1}},"required":["turnstileToken"]};

function validate68(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_UploadSessionInput" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate68.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.turnstileToken === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "turnstileToken"},message:"must have required property '"+"turnstileToken"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
for(const key0 in data){
if(!(key0 === "turnstileToken")){
const err1 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
if(data.turnstileToken !== undefined){
let data0 = data.turnstileToken;
if(typeof data0 === "string"){
if(func1(data0) < 1){
const err2 = {instancePath:instancePath+"/turnstileToken",schemaPath:"#/properties/turnstileToken/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
else {
const err3 = {instancePath:instancePath+"/turnstileToken",schemaPath:"#/properties/turnstileToken/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
}
else {
const err4 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
validate68.errors = vErrors;
return errors === 0;
}
validate68.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_UploadSessionResponse = validate69;
const schema143 = {"$id":"schema_UploadSessionResponse","type":"object","additionalProperties":false,"properties":{"token":{"type":"string","description":"Signed upload-session token; send as X-Upload-Token or in the start body."},"expiresAt":{"$ref":"gamo#/components/schemas/Timestamp"}},"required":["token","expiresAt"]};

function validate69(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_UploadSessionResponse" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate69.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.token === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "token"},message:"must have required property '"+"token"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.expiresAt === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "expiresAt"},message:"must have required property '"+"expiresAt"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "token") || (key0 === "expiresAt"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.token !== undefined){
if(typeof data.token !== "string"){
const err3 = {instancePath:instancePath+"/token",schemaPath:"#/properties/token/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.expiresAt !== undefined){
let data1 = data.expiresAt;
if(typeof data1 === "string"){
if(!(formats0.validate(data1))){
const err4 = {instancePath:instancePath+"/expiresAt",schemaPath:"gamo#/components/schemas/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
else {
const err5 = {instancePath:instancePath+"/expiresAt",schemaPath:"gamo#/components/schemas/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
}
else {
const err6 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
validate69.errors = vErrors;
return errors === 0;
}
validate69.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_StartUploadInput = validate70;
const schema145 = {"$id":"schema_StartUploadInput","type":"object","additionalProperties":false,"properties":{"token":{"type":"string","minLength":1},"questionId":{"type":"string","minLength":1},"filename":{"type":"string","minLength":1,"maxLength":255},"size":{"type":"integer","minimum":1,"description":"Declared size in bytes; checked against the stored object on completion."},"contentType":{"type":"string","minLength":1}},"required":["token","questionId","filename","size","contentType"]};

function validate70(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_StartUploadInput" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate70.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.token === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "token"},message:"must have required property '"+"token"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.questionId === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "questionId"},message:"must have required property '"+"questionId"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.filename === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "filename"},message:"must have required property '"+"filename"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.size === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "size"},message:"must have required property '"+"size"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.contentType === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "contentType"},message:"must have required property '"+"contentType"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
for(const key0 in data){
if(!(((((key0 === "token") || (key0 === "questionId")) || (key0 === "filename")) || (key0 === "size")) || (key0 === "contentType"))){
const err5 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.token !== undefined){
let data0 = data.token;
if(typeof data0 === "string"){
if(func1(data0) < 1){
const err6 = {instancePath:instancePath+"/token",schemaPath:"#/properties/token/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
else {
const err7 = {instancePath:instancePath+"/token",schemaPath:"#/properties/token/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.questionId !== undefined){
let data1 = data.questionId;
if(typeof data1 === "string"){
if(func1(data1) < 1){
const err8 = {instancePath:instancePath+"/questionId",schemaPath:"#/properties/questionId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
else {
const err9 = {instancePath:instancePath+"/questionId",schemaPath:"#/properties/questionId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.filename !== undefined){
let data2 = data.filename;
if(typeof data2 === "string"){
if(func1(data2) > 255){
const err10 = {instancePath:instancePath+"/filename",schemaPath:"#/properties/filename/maxLength",keyword:"maxLength",params:{limit: 255},message:"must NOT have more than 255 characters"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(func1(data2) < 1){
const err11 = {instancePath:instancePath+"/filename",schemaPath:"#/properties/filename/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
else {
const err12 = {instancePath:instancePath+"/filename",schemaPath:"#/properties/filename/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.size !== undefined){
let data3 = data.size;
if(!((typeof data3 == "number") && (!(data3 % 1) && !isNaN(data3)))){
const err13 = {instancePath:instancePath+"/size",schemaPath:"#/properties/size/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(typeof data3 == "number"){
if(data3 < 1 || isNaN(data3)){
const err14 = {instancePath:instancePath+"/size",schemaPath:"#/properties/size/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
}
if(data.contentType !== undefined){
let data4 = data.contentType;
if(typeof data4 === "string"){
if(func1(data4) < 1){
const err15 = {instancePath:instancePath+"/contentType",schemaPath:"#/properties/contentType/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
else {
const err16 = {instancePath:instancePath+"/contentType",schemaPath:"#/properties/contentType/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
}
else {
const err17 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
validate70.errors = vErrors;
return errors === 0;
}
validate70.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_StartUploadResponse = validate71;
const schema146 = {"$id":"schema_StartUploadResponse","type":"object","additionalProperties":false,"properties":{"uploadId":{"$ref":"gamo#/components/schemas/Identifier"},"partSize":{"type":"integer","const":8388608,"description":"Bytes per part (8 MiB); the last part may be shorter."},"parts":{"type":"integer","minimum":1,"description":"Number of parts to send, numbered from 1."}},"required":["uploadId","partSize","parts"]};

function validate71(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_StartUploadResponse" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate71.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.uploadId === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "uploadId"},message:"must have required property '"+"uploadId"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.partSize === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "partSize"},message:"must have required property '"+"partSize"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.parts === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "parts"},message:"must have required property '"+"parts"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
for(const key0 in data){
if(!(((key0 === "uploadId") || (key0 === "partSize")) || (key0 === "parts"))){
const err3 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.uploadId !== undefined){
let data0 = data.uploadId;
if(typeof data0 === "string"){
if(func1(data0) < 1){
const err4 = {instancePath:instancePath+"/uploadId",schemaPath:"gamo#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
else {
const err5 = {instancePath:instancePath+"/uploadId",schemaPath:"gamo#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.partSize !== undefined){
let data1 = data.partSize;
if(!((typeof data1 == "number") && (!(data1 % 1) && !isNaN(data1)))){
const err6 = {instancePath:instancePath+"/partSize",schemaPath:"#/properties/partSize/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(8388608 !== data1){
const err7 = {instancePath:instancePath+"/partSize",schemaPath:"#/properties/partSize/const",keyword:"const",params:{allowedValue: 8388608},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.parts !== undefined){
let data2 = data.parts;
if(!((typeof data2 == "number") && (!(data2 % 1) && !isNaN(data2)))){
const err8 = {instancePath:instancePath+"/parts",schemaPath:"#/properties/parts/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(typeof data2 == "number"){
if(data2 < 1 || isNaN(data2)){
const err9 = {instancePath:instancePath+"/parts",schemaPath:"#/properties/parts/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
}
}
else {
const err10 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
validate71.errors = vErrors;
return errors === 0;
}
validate71.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_UploadPartResponse = validate72;
const schema148 = {"$id":"schema_UploadPartResponse","type":"object","additionalProperties":false,"properties":{"etag":{"type":"string"}}};

function validate72(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_UploadPartResponse" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate72.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
for(const key0 in data){
if(!(key0 === "etag")){
const err0 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
}
if(data.etag !== undefined){
if(typeof data.etag !== "string"){
const err1 = {instancePath:instancePath+"/etag",schemaPath:"#/properties/etag/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
}
else {
const err2 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
validate72.errors = vErrors;
return errors === 0;
}
validate72.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_CompleteUploadResponse = validate73;
const schema149 = {"$id":"schema_CompleteUploadResponse","type":"object","additionalProperties":false,"properties":{"status":{"type":"string","enum":["verified","rejected"]},"reason":{"type":"string","description":"Present when rejected: safe, generic reason code. The stored object is deleted."}},"required":["status"]};

function validate73(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_CompleteUploadResponse" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate73.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.status === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "status") || (key0 === "reason"))){
const err1 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
if(data.status !== undefined){
let data0 = data.status;
if(typeof data0 !== "string"){
const err2 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(!((data0 === "verified") || (data0 === "rejected"))){
const err3 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/enum",keyword:"enum",params:{allowedValues: schema149.properties.status.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.reason !== undefined){
if(typeof data.reason !== "string"){
const err4 = {instancePath:instancePath+"/reason",schemaPath:"#/properties/reason/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
}
else {
const err5 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
validate73.errors = vErrors;
return errors === 0;
}
validate73.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_RosterMember = validate74;
const schema150 = {"$id":"schema_RosterMember","type":"object","additionalProperties":false,"properties":{"id":{"$ref":"gamo#/components/schemas/Identifier"},"submissionId":{"$ref":"gamo#/components/schemas/Identifier"},"program":{"type":"string","enum":["worship","production","academy"]},"displayName":{"type":"string"},"email":{"type":"string","format":"email"},"phone":{"type":["string","null"]},"roles":{"type":"array","items":{"type":"string"}},"city":{"type":["string","null"]},"canTeach":{"type":"boolean"},"status":{"type":"string","enum":["active","paused","removed"]},"w9ReceivedAt":{"oneOf":[{"$ref":"gamo#/components/schemas/Timestamp"},{"type":"null"}],"description":"Date received only; no tax identifiers are stored."},"approvedAt":{"$ref":"gamo#/components/schemas/Timestamp"}},"required":["id","submissionId","program","displayName","email","roles","canTeach","status","approvedAt"]};

function validate74(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_RosterMember" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate74.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.submissionId === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "submissionId"},message:"must have required property '"+"submissionId"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.program === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "program"},message:"must have required property '"+"program"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.displayName === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "displayName"},message:"must have required property '"+"displayName"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.email === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "email"},message:"must have required property '"+"email"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.roles === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "roles"},message:"must have required property '"+"roles"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.canTeach === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "canTeach"},message:"must have required property '"+"canTeach"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.status === undefined){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data.approvedAt === undefined){
const err8 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "approvedAt"},message:"must have required property '"+"approvedAt"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
for(const key0 in data){
if(!(func11.call(schema150.properties, key0))){
const err9 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.id !== undefined){
let data0 = data.id;
if(typeof data0 === "string"){
if(func1(data0) < 1){
const err10 = {instancePath:instancePath+"/id",schemaPath:"gamo#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
else {
const err11 = {instancePath:instancePath+"/id",schemaPath:"gamo#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.submissionId !== undefined){
let data1 = data.submissionId;
if(typeof data1 === "string"){
if(func1(data1) < 1){
const err12 = {instancePath:instancePath+"/submissionId",schemaPath:"gamo#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
else {
const err13 = {instancePath:instancePath+"/submissionId",schemaPath:"gamo#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.program !== undefined){
let data2 = data.program;
if(typeof data2 !== "string"){
const err14 = {instancePath:instancePath+"/program",schemaPath:"#/properties/program/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(!(((data2 === "worship") || (data2 === "production")) || (data2 === "academy"))){
const err15 = {instancePath:instancePath+"/program",schemaPath:"#/properties/program/enum",keyword:"enum",params:{allowedValues: schema150.properties.program.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.displayName !== undefined){
if(typeof data.displayName !== "string"){
const err16 = {instancePath:instancePath+"/displayName",schemaPath:"#/properties/displayName/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data.email !== undefined){
let data4 = data.email;
if(typeof data4 === "string"){
if(!(formats6.test(data4))){
const err17 = {instancePath:instancePath+"/email",schemaPath:"#/properties/email/format",keyword:"format",params:{format: "email"},message:"must match format \""+"email"+"\""};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
else {
const err18 = {instancePath:instancePath+"/email",schemaPath:"#/properties/email/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.phone !== undefined){
let data5 = data.phone;
if((typeof data5 !== "string") && (data5 !== null)){
const err19 = {instancePath:instancePath+"/phone",schemaPath:"#/properties/phone/type",keyword:"type",params:{type: schema150.properties.phone.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
if(data.roles !== undefined){
let data6 = data.roles;
if(Array.isArray(data6)){
const len0 = data6.length;
for(let i0=0; i0<len0; i0++){
if(typeof data6[i0] !== "string"){
const err20 = {instancePath:instancePath+"/roles/" + i0,schemaPath:"#/properties/roles/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
}
else {
const err21 = {instancePath:instancePath+"/roles",schemaPath:"#/properties/roles/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data.city !== undefined){
let data8 = data.city;
if((typeof data8 !== "string") && (data8 !== null)){
const err22 = {instancePath:instancePath+"/city",schemaPath:"#/properties/city/type",keyword:"type",params:{type: schema150.properties.city.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
if(data.canTeach !== undefined){
if(typeof data.canTeach !== "boolean"){
const err23 = {instancePath:instancePath+"/canTeach",schemaPath:"#/properties/canTeach/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
if(data.status !== undefined){
let data10 = data.status;
if(typeof data10 !== "string"){
const err24 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
if(!(((data10 === "active") || (data10 === "paused")) || (data10 === "removed"))){
const err25 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/enum",keyword:"enum",params:{allowedValues: schema150.properties.status.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
if(data.w9ReceivedAt !== undefined){
let data11 = data.w9ReceivedAt;
const _errs27 = errors;
let valid5 = false;
let passing0 = null;
const _errs28 = errors;
if(typeof data11 === "string"){
if(!(formats0.validate(data11))){
const err26 = {instancePath:instancePath+"/w9ReceivedAt",schemaPath:"gamo#/components/schemas/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
else {
const err27 = {instancePath:instancePath+"/w9ReceivedAt",schemaPath:"gamo#/components/schemas/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
var _valid0 = _errs28 === errors;
if(_valid0){
valid5 = true;
passing0 = 0;
}
const _errs31 = errors;
if(data11 !== null){
const err28 = {instancePath:instancePath+"/w9ReceivedAt",schemaPath:"#/properties/w9ReceivedAt/oneOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
var _valid0 = _errs31 === errors;
if(_valid0 && valid5){
valid5 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid5 = true;
passing0 = 1;
}
}
if(!valid5){
const err29 = {instancePath:instancePath+"/w9ReceivedAt",schemaPath:"#/properties/w9ReceivedAt/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
else {
errors = _errs27;
if(vErrors !== null){
if(_errs27){
vErrors.length = _errs27;
}
else {
vErrors = null;
}
}
}
}
if(data.approvedAt !== undefined){
let data12 = data.approvedAt;
if(typeof data12 === "string"){
if(!(formats0.validate(data12))){
const err30 = {instancePath:instancePath+"/approvedAt",schemaPath:"gamo#/components/schemas/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
else {
const err31 = {instancePath:instancePath+"/approvedAt",schemaPath:"gamo#/components/schemas/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
}
else {
const err32 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
validate74.errors = vErrors;
return errors === 0;
}
validate74.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_RosterListResponse = validate75;
const schema155 = {"$id":"schema_RosterListResponse","type":"object","additionalProperties":false,"properties":{"success":{"const":true},"data":{"type":"array","items":{"$ref":"gamo#/components/schemas/RosterMember"}},"meta":{"$ref":"gamo#/components/schemas/CursorMeta"}},"required":["success","data"]};
const schema156 = {"type":"object","additionalProperties":false,"properties":{"id":{"$ref":"#/components/schemas/Identifier"},"submissionId":{"$ref":"#/components/schemas/Identifier"},"program":{"type":"string","enum":["worship","production","academy"]},"displayName":{"type":"string"},"email":{"type":"string","format":"email"},"phone":{"type":["string","null"]},"roles":{"type":"array","items":{"type":"string"}},"city":{"type":["string","null"]},"canTeach":{"type":"boolean"},"status":{"type":"string","enum":["active","paused","removed"]},"w9ReceivedAt":{"oneOf":[{"$ref":"#/components/schemas/Timestamp"},{"type":"null"}],"description":"Date received only; no tax identifiers are stored."},"approvedAt":{"$ref":"#/components/schemas/Timestamp"}},"required":["id","submissionId","program","displayName","email","roles","canTeach","status","approvedAt"]};

function validate76(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate76.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.submissionId === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "submissionId"},message:"must have required property '"+"submissionId"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.program === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "program"},message:"must have required property '"+"program"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.displayName === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "displayName"},message:"must have required property '"+"displayName"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.email === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "email"},message:"must have required property '"+"email"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.roles === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "roles"},message:"must have required property '"+"roles"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.canTeach === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "canTeach"},message:"must have required property '"+"canTeach"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.status === undefined){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data.approvedAt === undefined){
const err8 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "approvedAt"},message:"must have required property '"+"approvedAt"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
for(const key0 in data){
if(!(func11.call(schema156.properties, key0))){
const err9 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.id !== undefined){
let data0 = data.id;
if(typeof data0 === "string"){
if(func1(data0) < 1){
const err10 = {instancePath:instancePath+"/id",schemaPath:"#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
else {
const err11 = {instancePath:instancePath+"/id",schemaPath:"#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.submissionId !== undefined){
let data1 = data.submissionId;
if(typeof data1 === "string"){
if(func1(data1) < 1){
const err12 = {instancePath:instancePath+"/submissionId",schemaPath:"#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
else {
const err13 = {instancePath:instancePath+"/submissionId",schemaPath:"#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.program !== undefined){
let data2 = data.program;
if(typeof data2 !== "string"){
const err14 = {instancePath:instancePath+"/program",schemaPath:"#/properties/program/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(!(((data2 === "worship") || (data2 === "production")) || (data2 === "academy"))){
const err15 = {instancePath:instancePath+"/program",schemaPath:"#/properties/program/enum",keyword:"enum",params:{allowedValues: schema156.properties.program.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.displayName !== undefined){
if(typeof data.displayName !== "string"){
const err16 = {instancePath:instancePath+"/displayName",schemaPath:"#/properties/displayName/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data.email !== undefined){
let data4 = data.email;
if(typeof data4 === "string"){
if(!(formats6.test(data4))){
const err17 = {instancePath:instancePath+"/email",schemaPath:"#/properties/email/format",keyword:"format",params:{format: "email"},message:"must match format \""+"email"+"\""};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
else {
const err18 = {instancePath:instancePath+"/email",schemaPath:"#/properties/email/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.phone !== undefined){
let data5 = data.phone;
if((typeof data5 !== "string") && (data5 !== null)){
const err19 = {instancePath:instancePath+"/phone",schemaPath:"#/properties/phone/type",keyword:"type",params:{type: schema156.properties.phone.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
if(data.roles !== undefined){
let data6 = data.roles;
if(Array.isArray(data6)){
const len0 = data6.length;
for(let i0=0; i0<len0; i0++){
if(typeof data6[i0] !== "string"){
const err20 = {instancePath:instancePath+"/roles/" + i0,schemaPath:"#/properties/roles/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
}
else {
const err21 = {instancePath:instancePath+"/roles",schemaPath:"#/properties/roles/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data.city !== undefined){
let data8 = data.city;
if((typeof data8 !== "string") && (data8 !== null)){
const err22 = {instancePath:instancePath+"/city",schemaPath:"#/properties/city/type",keyword:"type",params:{type: schema156.properties.city.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
if(data.canTeach !== undefined){
if(typeof data.canTeach !== "boolean"){
const err23 = {instancePath:instancePath+"/canTeach",schemaPath:"#/properties/canTeach/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
if(data.status !== undefined){
let data10 = data.status;
if(typeof data10 !== "string"){
const err24 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
if(!(((data10 === "active") || (data10 === "paused")) || (data10 === "removed"))){
const err25 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/enum",keyword:"enum",params:{allowedValues: schema156.properties.status.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
if(data.w9ReceivedAt !== undefined){
let data11 = data.w9ReceivedAt;
const _errs27 = errors;
let valid5 = false;
let passing0 = null;
const _errs28 = errors;
if(typeof data11 === "string"){
if(!(formats0.validate(data11))){
const err26 = {instancePath:instancePath+"/w9ReceivedAt",schemaPath:"#/components/schemas/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
else {
const err27 = {instancePath:instancePath+"/w9ReceivedAt",schemaPath:"#/components/schemas/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
var _valid0 = _errs28 === errors;
if(_valid0){
valid5 = true;
passing0 = 0;
}
const _errs31 = errors;
if(data11 !== null){
const err28 = {instancePath:instancePath+"/w9ReceivedAt",schemaPath:"#/properties/w9ReceivedAt/oneOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
var _valid0 = _errs31 === errors;
if(_valid0 && valid5){
valid5 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid5 = true;
passing0 = 1;
}
}
if(!valid5){
const err29 = {instancePath:instancePath+"/w9ReceivedAt",schemaPath:"#/properties/w9ReceivedAt/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
else {
errors = _errs27;
if(vErrors !== null){
if(_errs27){
vErrors.length = _errs27;
}
else {
vErrors = null;
}
}
}
}
if(data.approvedAt !== undefined){
let data12 = data.approvedAt;
if(typeof data12 === "string"){
if(!(formats0.validate(data12))){
const err30 = {instancePath:instancePath+"/approvedAt",schemaPath:"#/components/schemas/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
else {
const err31 = {instancePath:instancePath+"/approvedAt",schemaPath:"#/components/schemas/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
}
else {
const err32 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
validate76.errors = vErrors;
return errors === 0;
}
validate76.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate75(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_RosterListResponse" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate75.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.success === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "success"},message:"must have required property '"+"success"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.data === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "data"},message:"must have required property '"+"data"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!(((key0 === "success") || (key0 === "data")) || (key0 === "meta"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.success !== undefined){
if(true !== data.success){
const err3 = {instancePath:instancePath+"/success",schemaPath:"#/properties/success/const",keyword:"const",params:{allowedValue: true},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.data !== undefined){
let data1 = data.data;
if(Array.isArray(data1)){
const len0 = data1.length;
for(let i0=0; i0<len0; i0++){
if(!(validate76(data1[i0], {instancePath:instancePath+"/data/" + i0,parentData:data1,parentDataProperty:i0,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate76.errors : vErrors.concat(validate76.errors);
errors = vErrors.length;
}
}
}
else {
const err4 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.meta !== undefined){
let data3 = data.meta;
if(data3 && typeof data3 == "object" && !Array.isArray(data3)){
if(data3.nextCursor === undefined){
const err5 = {instancePath:instancePath+"/meta",schemaPath:"gamo#/components/schemas/CursorMeta/required",keyword:"required",params:{missingProperty: "nextCursor"},message:"must have required property '"+"nextCursor"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
for(const key1 in data3){
if(!(key1 === "nextCursor")){
const err6 = {instancePath:instancePath+"/meta",schemaPath:"gamo#/components/schemas/CursorMeta/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data3.nextCursor !== undefined){
let data4 = data3.nextCursor;
if((typeof data4 !== "string") && (data4 !== null)){
const err7 = {instancePath:instancePath+"/meta/nextCursor",schemaPath:"gamo#/components/schemas/CursorMeta/properties/nextCursor/type",keyword:"type",params:{type: schema121.properties.nextCursor.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
}
else {
const err8 = {instancePath:instancePath+"/meta",schemaPath:"gamo#/components/schemas/CursorMeta/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
}
else {
const err9 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
validate75.errors = vErrors;
return errors === 0;
}
validate75.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_SendOfferInput = validate78;
const schema162 = {"$id":"schema_SendOfferInput","type":"object","additionalProperties":false,"properties":{"rosterMemberId":{"$ref":"gamo#/components/schemas/Identifier"},"role":{"type":"string","minLength":1},"payCents":{"type":"integer","minimum":0,"description":"Integer minor units (USD cents) offered to the musician; never reduced by an administrative allocation."}},"required":["rosterMemberId","role","payCents"]};

function validate78(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_SendOfferInput" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate78.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.rosterMemberId === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "rosterMemberId"},message:"must have required property '"+"rosterMemberId"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.role === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "role"},message:"must have required property '"+"role"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.payCents === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "payCents"},message:"must have required property '"+"payCents"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
for(const key0 in data){
if(!(((key0 === "rosterMemberId") || (key0 === "role")) || (key0 === "payCents"))){
const err3 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.rosterMemberId !== undefined){
let data0 = data.rosterMemberId;
if(typeof data0 === "string"){
if(func1(data0) < 1){
const err4 = {instancePath:instancePath+"/rosterMemberId",schemaPath:"gamo#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
else {
const err5 = {instancePath:instancePath+"/rosterMemberId",schemaPath:"gamo#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.role !== undefined){
let data1 = data.role;
if(typeof data1 === "string"){
if(func1(data1) < 1){
const err6 = {instancePath:instancePath+"/role",schemaPath:"#/properties/role/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
else {
const err7 = {instancePath:instancePath+"/role",schemaPath:"#/properties/role/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.payCents !== undefined){
let data2 = data.payCents;
if(!((typeof data2 == "number") && (!(data2 % 1) && !isNaN(data2)))){
const err8 = {instancePath:instancePath+"/payCents",schemaPath:"#/properties/payCents/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(typeof data2 == "number"){
if(data2 < 0 || isNaN(data2)){
const err9 = {instancePath:instancePath+"/payCents",schemaPath:"#/properties/payCents/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
}
}
else {
const err10 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
validate78.errors = vErrors;
return errors === 0;
}
validate78.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_SendOfferResponse = validate79;
const schema164 = {"$id":"schema_SendOfferResponse","type":"object","additionalProperties":false,"properties":{"success":{"const":true},"data":{"type":"object","additionalProperties":false,"properties":{"offerId":{"$ref":"gamo#/components/schemas/Identifier"},"expiresAt":{"$ref":"gamo#/components/schemas/Timestamp","description":"Earlier of 72 hours after sending or the service start."}},"required":["offerId","expiresAt"]}},"required":["success","data"]};

function validate79(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_SendOfferResponse" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate79.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.success === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "success"},message:"must have required property '"+"success"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.data === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "data"},message:"must have required property '"+"data"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "success") || (key0 === "data"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.success !== undefined){
if(true !== data.success){
const err3 = {instancePath:instancePath+"/success",schemaPath:"#/properties/success/const",keyword:"const",params:{allowedValue: true},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.data !== undefined){
let data1 = data.data;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.offerId === undefined){
const err4 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/required",keyword:"required",params:{missingProperty: "offerId"},message:"must have required property '"+"offerId"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data1.expiresAt === undefined){
const err5 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/required",keyword:"required",params:{missingProperty: "expiresAt"},message:"must have required property '"+"expiresAt"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
for(const key1 in data1){
if(!((key1 === "offerId") || (key1 === "expiresAt"))){
const err6 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data1.offerId !== undefined){
let data2 = data1.offerId;
if(typeof data2 === "string"){
if(func1(data2) < 1){
const err7 = {instancePath:instancePath+"/data/offerId",schemaPath:"gamo#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/data/offerId",schemaPath:"gamo#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data1.expiresAt !== undefined){
let data3 = data1.expiresAt;
if(typeof data3 === "string"){
if(!(formats0.validate(data3))){
const err9 = {instancePath:instancePath+"/data/expiresAt",schemaPath:"gamo#/components/schemas/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/data/expiresAt",schemaPath:"gamo#/components/schemas/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
}
else {
const err11 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
}
else {
const err12 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
validate79.errors = vErrors;
return errors === 0;
}
validate79.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_WithdrawOfferResponse = validate80;
const schema167 = {"$id":"schema_WithdrawOfferResponse","type":"object","additionalProperties":false,"properties":{"success":{"const":true},"data":{"type":"object","additionalProperties":false,"properties":{"offerId":{"$ref":"gamo#/components/schemas/Identifier"},"status":{"const":"withdrawn"}},"required":["offerId","status"]}},"required":["success","data"]};

function validate80(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_WithdrawOfferResponse" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate80.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.success === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "success"},message:"must have required property '"+"success"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.data === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "data"},message:"must have required property '"+"data"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "success") || (key0 === "data"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.success !== undefined){
if(true !== data.success){
const err3 = {instancePath:instancePath+"/success",schemaPath:"#/properties/success/const",keyword:"const",params:{allowedValue: true},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.data !== undefined){
let data1 = data.data;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.offerId === undefined){
const err4 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/required",keyword:"required",params:{missingProperty: "offerId"},message:"must have required property '"+"offerId"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data1.status === undefined){
const err5 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
for(const key1 in data1){
if(!((key1 === "offerId") || (key1 === "status"))){
const err6 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data1.offerId !== undefined){
let data2 = data1.offerId;
if(typeof data2 === "string"){
if(func1(data2) < 1){
const err7 = {instancePath:instancePath+"/data/offerId",schemaPath:"gamo#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/data/offerId",schemaPath:"gamo#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data1.status !== undefined){
if("withdrawn" !== data1.status){
const err9 = {instancePath:instancePath+"/data/status",schemaPath:"#/properties/data/properties/status/const",keyword:"const",params:{allowedValue: "withdrawn"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
}
else {
const err10 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
}
else {
const err11 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
validate80.errors = vErrors;
return errors === 0;
}
validate80.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_OfferResponseForm = validate81;
const schema169 = {"$id":"schema_OfferResponseForm","type":"object","additionalProperties":false,"properties":{"action":{"type":"string","enum":["accept","decline"]}},"required":["action"],"description":"application/x-www-form-urlencoded body of the offer page POST."};

function validate81(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_OfferResponseForm" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate81.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.action === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "action"},message:"must have required property '"+"action"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
for(const key0 in data){
if(!(key0 === "action")){
const err1 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
if(data.action !== undefined){
let data0 = data.action;
if(typeof data0 !== "string"){
const err2 = {instancePath:instancePath+"/action",schemaPath:"#/properties/action/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(!((data0 === "accept") || (data0 === "decline"))){
const err3 = {instancePath:instancePath+"/action",schemaPath:"#/properties/action/enum",keyword:"enum",params:{allowedValues: schema169.properties.action.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
}
else {
const err4 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
validate81.errors = vErrors;
return errors === 0;
}
validate81.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_InvoiceLineKind = validate82;
const schema170 = {"$id":"schema_InvoiceLineKind","type":"string","enum":["musician_pay","lesson","production","other","gamo_admin"],"description":"gamo_admin lines are refused (400 gamo_admin_not_approved) unless GAMO_ADMIN_FEE_APPROVED=true; fees are proposals until approved. Musician pay and Gamo lines are always separate line items."};

function validate82(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_InvoiceLineKind" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate82.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(typeof data !== "string"){
const err0 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(!(((((data === "musician_pay") || (data === "lesson")) || (data === "production")) || (data === "other")) || (data === "gamo_admin"))){
const err1 = {instancePath,schemaPath:"#/enum",keyword:"enum",params:{allowedValues: schema170.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
validate82.errors = vErrors;
return errors === 0;
}
validate82.evaluated = {"dynamicProps":false,"dynamicItems":false};

export const schema_PaymentMethod = validate83;
const schema171 = {"$id":"schema_PaymentMethod","type":"string","enum":["stripe","check","zelle","ach","cash","other"]};

function validate83(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_PaymentMethod" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate83.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(typeof data !== "string"){
const err0 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(!((((((data === "stripe") || (data === "check")) || (data === "zelle")) || (data === "ach")) || (data === "cash")) || (data === "other"))){
const err1 = {instancePath,schemaPath:"#/enum",keyword:"enum",params:{allowedValues: schema171.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
validate83.errors = vErrors;
return errors === 0;
}
validate83.evaluated = {"dynamicProps":false,"dynamicItems":false};

export const schema_InvoiceLine = validate84;
const schema172 = {"$id":"schema_InvoiceLine","type":"object","additionalProperties":false,"properties":{"id":{"$ref":"gamo#/components/schemas/Identifier"},"kind":{"$ref":"gamo#/components/schemas/InvoiceLineKind"},"description":{"type":"string"},"quantity":{"type":"integer","minimum":1},"unitAmountCents":{"type":"integer","minimum":0},"amountCents":{"type":"integer","minimum":0,"description":"quantity x unitAmountCents, integer minor units."},"payeeRosterMemberId":{"oneOf":[{"$ref":"gamo#/components/schemas/Identifier"},{"type":"null"}],"description":"Set for musician_pay lines."},"payoutRecordedAt":{"oneOf":[{"$ref":"gamo#/components/schemas/Timestamp"},{"type":"null"}]}},"required":["id","kind","description","quantity","unitAmountCents","amountCents"]};
const schema174 = {"type":"string","enum":["musician_pay","lesson","production","other","gamo_admin"],"description":"gamo_admin lines are refused (400 gamo_admin_not_approved) unless GAMO_ADMIN_FEE_APPROVED=true; fees are proposals until approved. Musician pay and Gamo lines are always separate line items."};

function validate84(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_InvoiceLine" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate84.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.kind === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.description === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "description"},message:"must have required property '"+"description"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.quantity === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "quantity"},message:"must have required property '"+"quantity"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.unitAmountCents === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "unitAmountCents"},message:"must have required property '"+"unitAmountCents"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.amountCents === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "amountCents"},message:"must have required property '"+"amountCents"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
for(const key0 in data){
if(!((((((((key0 === "id") || (key0 === "kind")) || (key0 === "description")) || (key0 === "quantity")) || (key0 === "unitAmountCents")) || (key0 === "amountCents")) || (key0 === "payeeRosterMemberId")) || (key0 === "payoutRecordedAt"))){
const err6 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.id !== undefined){
let data0 = data.id;
if(typeof data0 === "string"){
if(func1(data0) < 1){
const err7 = {instancePath:instancePath+"/id",schemaPath:"gamo#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/id",schemaPath:"gamo#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.kind !== undefined){
let data1 = data.kind;
if(typeof data1 !== "string"){
const err9 = {instancePath:instancePath+"/kind",schemaPath:"gamo#/components/schemas/InvoiceLineKind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(!(((((data1 === "musician_pay") || (data1 === "lesson")) || (data1 === "production")) || (data1 === "other")) || (data1 === "gamo_admin"))){
const err10 = {instancePath:instancePath+"/kind",schemaPath:"gamo#/components/schemas/InvoiceLineKind/enum",keyword:"enum",params:{allowedValues: schema174.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.description !== undefined){
if(typeof data.description !== "string"){
const err11 = {instancePath:instancePath+"/description",schemaPath:"#/properties/description/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.quantity !== undefined){
let data3 = data.quantity;
if(!((typeof data3 == "number") && (!(data3 % 1) && !isNaN(data3)))){
const err12 = {instancePath:instancePath+"/quantity",schemaPath:"#/properties/quantity/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(typeof data3 == "number"){
if(data3 < 1 || isNaN(data3)){
const err13 = {instancePath:instancePath+"/quantity",schemaPath:"#/properties/quantity/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
}
if(data.unitAmountCents !== undefined){
let data4 = data.unitAmountCents;
if(!((typeof data4 == "number") && (!(data4 % 1) && !isNaN(data4)))){
const err14 = {instancePath:instancePath+"/unitAmountCents",schemaPath:"#/properties/unitAmountCents/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(typeof data4 == "number"){
if(data4 < 0 || isNaN(data4)){
const err15 = {instancePath:instancePath+"/unitAmountCents",schemaPath:"#/properties/unitAmountCents/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
}
if(data.amountCents !== undefined){
let data5 = data.amountCents;
if(!((typeof data5 == "number") && (!(data5 % 1) && !isNaN(data5)))){
const err16 = {instancePath:instancePath+"/amountCents",schemaPath:"#/properties/amountCents/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if(typeof data5 == "number"){
if(data5 < 0 || isNaN(data5)){
const err17 = {instancePath:instancePath+"/amountCents",schemaPath:"#/properties/amountCents/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
}
if(data.payeeRosterMemberId !== undefined){
let data6 = data.payeeRosterMemberId;
const _errs17 = errors;
let valid3 = false;
let passing0 = null;
const _errs18 = errors;
if(typeof data6 === "string"){
if(func1(data6) < 1){
const err18 = {instancePath:instancePath+"/payeeRosterMemberId",schemaPath:"gamo#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
else {
const err19 = {instancePath:instancePath+"/payeeRosterMemberId",schemaPath:"gamo#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
var _valid0 = _errs18 === errors;
if(_valid0){
valid3 = true;
passing0 = 0;
}
const _errs21 = errors;
if(data6 !== null){
const err20 = {instancePath:instancePath+"/payeeRosterMemberId",schemaPath:"#/properties/payeeRosterMemberId/oneOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
var _valid0 = _errs21 === errors;
if(_valid0 && valid3){
valid3 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid3 = true;
passing0 = 1;
}
}
if(!valid3){
const err21 = {instancePath:instancePath+"/payeeRosterMemberId",schemaPath:"#/properties/payeeRosterMemberId/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
else {
errors = _errs17;
if(vErrors !== null){
if(_errs17){
vErrors.length = _errs17;
}
else {
vErrors = null;
}
}
}
}
if(data.payoutRecordedAt !== undefined){
let data7 = data.payoutRecordedAt;
const _errs24 = errors;
let valid5 = false;
let passing1 = null;
const _errs25 = errors;
if(typeof data7 === "string"){
if(!(formats0.validate(data7))){
const err22 = {instancePath:instancePath+"/payoutRecordedAt",schemaPath:"gamo#/components/schemas/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
else {
const err23 = {instancePath:instancePath+"/payoutRecordedAt",schemaPath:"gamo#/components/schemas/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
var _valid1 = _errs25 === errors;
if(_valid1){
valid5 = true;
passing1 = 0;
}
const _errs28 = errors;
if(data7 !== null){
const err24 = {instancePath:instancePath+"/payoutRecordedAt",schemaPath:"#/properties/payoutRecordedAt/oneOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
var _valid1 = _errs28 === errors;
if(_valid1 && valid5){
valid5 = false;
passing1 = [passing1, 1];
}
else {
if(_valid1){
valid5 = true;
passing1 = 1;
}
}
if(!valid5){
const err25 = {instancePath:instancePath+"/payoutRecordedAt",schemaPath:"#/properties/payoutRecordedAt/oneOf",keyword:"oneOf",params:{passingSchemas: passing1},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
else {
errors = _errs24;
if(vErrors !== null){
if(_errs24){
vErrors.length = _errs24;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err26 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
validate84.errors = vErrors;
return errors === 0;
}
validate84.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_Invoice = validate85;
const schema177 = {"$id":"schema_Invoice","type":"object","additionalProperties":false,"properties":{"id":{"$ref":"gamo#/components/schemas/Identifier"},"number":{"type":"string","pattern":"^GS-[0-9]{4}-[0-9]{4,}$","description":"Sequential per year, e.g. GS-2026-0001."},"sourceType":{"type":"string","enum":["service_request","academy_registration","manual"]},"sourceId":{"type":["string","null"]},"billToName":{"type":"string"},"billToEmail":{"type":"string","format":"email"},"status":{"type":"string","enum":["draft","open","paid","void"]},"currency":{"const":"usd"},"totalCents":{"type":"integer","minimum":0},"dueDate":{"type":["string","null"],"format":"date"},"stripeInvoiceId":{"type":["string","null"]},"hostedUrl":{"type":["string","null"],"format":"uri"},"paidAt":{"oneOf":[{"$ref":"gamo#/components/schemas/Timestamp"},{"type":"null"}]},"paidMethod":{"oneOf":[{"$ref":"gamo#/components/schemas/PaymentMethod"},{"type":"null"}]},"paidReference":{"type":["string","null"]},"lines":{"type":"array","items":{"$ref":"gamo#/components/schemas/InvoiceLine"}},"createdAt":{"$ref":"gamo#/components/schemas/Timestamp"}},"required":["id","number","sourceType","billToName","billToEmail","status","currency","totalCents","lines","createdAt"]};
const schema180 = {"type":"string","enum":["stripe","check","zelle","ach","cash","other"]};
const pattern5 = new RegExp("^GS-[0-9]{4}-[0-9]{4,}$", "u");
const formats68 = formats.date;
const formats70 = formats.uri;
const schema181 = {"type":"object","additionalProperties":false,"properties":{"id":{"$ref":"#/components/schemas/Identifier"},"kind":{"$ref":"#/components/schemas/InvoiceLineKind"},"description":{"type":"string"},"quantity":{"type":"integer","minimum":1},"unitAmountCents":{"type":"integer","minimum":0},"amountCents":{"type":"integer","minimum":0,"description":"quantity x unitAmountCents, integer minor units."},"payeeRosterMemberId":{"oneOf":[{"$ref":"#/components/schemas/Identifier"},{"type":"null"}],"description":"Set for musician_pay lines."},"payoutRecordedAt":{"oneOf":[{"$ref":"#/components/schemas/Timestamp"},{"type":"null"}]}},"required":["id","kind","description","quantity","unitAmountCents","amountCents"]};

function validate86(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate86.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.kind === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.description === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "description"},message:"must have required property '"+"description"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.quantity === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "quantity"},message:"must have required property '"+"quantity"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.unitAmountCents === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "unitAmountCents"},message:"must have required property '"+"unitAmountCents"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.amountCents === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "amountCents"},message:"must have required property '"+"amountCents"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
for(const key0 in data){
if(!((((((((key0 === "id") || (key0 === "kind")) || (key0 === "description")) || (key0 === "quantity")) || (key0 === "unitAmountCents")) || (key0 === "amountCents")) || (key0 === "payeeRosterMemberId")) || (key0 === "payoutRecordedAt"))){
const err6 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.id !== undefined){
let data0 = data.id;
if(typeof data0 === "string"){
if(func1(data0) < 1){
const err7 = {instancePath:instancePath+"/id",schemaPath:"#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/id",schemaPath:"#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.kind !== undefined){
let data1 = data.kind;
if(typeof data1 !== "string"){
const err9 = {instancePath:instancePath+"/kind",schemaPath:"#/components/schemas/InvoiceLineKind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(!(((((data1 === "musician_pay") || (data1 === "lesson")) || (data1 === "production")) || (data1 === "other")) || (data1 === "gamo_admin"))){
const err10 = {instancePath:instancePath+"/kind",schemaPath:"#/components/schemas/InvoiceLineKind/enum",keyword:"enum",params:{allowedValues: schema174.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.description !== undefined){
if(typeof data.description !== "string"){
const err11 = {instancePath:instancePath+"/description",schemaPath:"#/properties/description/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.quantity !== undefined){
let data3 = data.quantity;
if(!((typeof data3 == "number") && (!(data3 % 1) && !isNaN(data3)))){
const err12 = {instancePath:instancePath+"/quantity",schemaPath:"#/properties/quantity/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(typeof data3 == "number"){
if(data3 < 1 || isNaN(data3)){
const err13 = {instancePath:instancePath+"/quantity",schemaPath:"#/properties/quantity/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
}
if(data.unitAmountCents !== undefined){
let data4 = data.unitAmountCents;
if(!((typeof data4 == "number") && (!(data4 % 1) && !isNaN(data4)))){
const err14 = {instancePath:instancePath+"/unitAmountCents",schemaPath:"#/properties/unitAmountCents/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(typeof data4 == "number"){
if(data4 < 0 || isNaN(data4)){
const err15 = {instancePath:instancePath+"/unitAmountCents",schemaPath:"#/properties/unitAmountCents/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
}
if(data.amountCents !== undefined){
let data5 = data.amountCents;
if(!((typeof data5 == "number") && (!(data5 % 1) && !isNaN(data5)))){
const err16 = {instancePath:instancePath+"/amountCents",schemaPath:"#/properties/amountCents/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if(typeof data5 == "number"){
if(data5 < 0 || isNaN(data5)){
const err17 = {instancePath:instancePath+"/amountCents",schemaPath:"#/properties/amountCents/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
}
if(data.payeeRosterMemberId !== undefined){
let data6 = data.payeeRosterMemberId;
const _errs17 = errors;
let valid3 = false;
let passing0 = null;
const _errs18 = errors;
if(typeof data6 === "string"){
if(func1(data6) < 1){
const err18 = {instancePath:instancePath+"/payeeRosterMemberId",schemaPath:"#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
else {
const err19 = {instancePath:instancePath+"/payeeRosterMemberId",schemaPath:"#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
var _valid0 = _errs18 === errors;
if(_valid0){
valid3 = true;
passing0 = 0;
}
const _errs21 = errors;
if(data6 !== null){
const err20 = {instancePath:instancePath+"/payeeRosterMemberId",schemaPath:"#/properties/payeeRosterMemberId/oneOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
var _valid0 = _errs21 === errors;
if(_valid0 && valid3){
valid3 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid3 = true;
passing0 = 1;
}
}
if(!valid3){
const err21 = {instancePath:instancePath+"/payeeRosterMemberId",schemaPath:"#/properties/payeeRosterMemberId/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
else {
errors = _errs17;
if(vErrors !== null){
if(_errs17){
vErrors.length = _errs17;
}
else {
vErrors = null;
}
}
}
}
if(data.payoutRecordedAt !== undefined){
let data7 = data.payoutRecordedAt;
const _errs24 = errors;
let valid5 = false;
let passing1 = null;
const _errs25 = errors;
if(typeof data7 === "string"){
if(!(formats0.validate(data7))){
const err22 = {instancePath:instancePath+"/payoutRecordedAt",schemaPath:"#/components/schemas/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
else {
const err23 = {instancePath:instancePath+"/payoutRecordedAt",schemaPath:"#/components/schemas/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
var _valid1 = _errs25 === errors;
if(_valid1){
valid5 = true;
passing1 = 0;
}
const _errs28 = errors;
if(data7 !== null){
const err24 = {instancePath:instancePath+"/payoutRecordedAt",schemaPath:"#/properties/payoutRecordedAt/oneOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
var _valid1 = _errs28 === errors;
if(_valid1 && valid5){
valid5 = false;
passing1 = [passing1, 1];
}
else {
if(_valid1){
valid5 = true;
passing1 = 1;
}
}
if(!valid5){
const err25 = {instancePath:instancePath+"/payoutRecordedAt",schemaPath:"#/properties/payoutRecordedAt/oneOf",keyword:"oneOf",params:{passingSchemas: passing1},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
else {
errors = _errs24;
if(vErrors !== null){
if(_errs24){
vErrors.length = _errs24;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err26 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
validate86.errors = vErrors;
return errors === 0;
}
validate86.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate85(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_Invoice" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate85.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.number === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "number"},message:"must have required property '"+"number"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.sourceType === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "sourceType"},message:"must have required property '"+"sourceType"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.billToName === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "billToName"},message:"must have required property '"+"billToName"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.billToEmail === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "billToEmail"},message:"must have required property '"+"billToEmail"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.status === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.currency === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "currency"},message:"must have required property '"+"currency"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.totalCents === undefined){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "totalCents"},message:"must have required property '"+"totalCents"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data.lines === undefined){
const err8 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "lines"},message:"must have required property '"+"lines"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(data.createdAt === undefined){
const err9 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "createdAt"},message:"must have required property '"+"createdAt"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
for(const key0 in data){
if(!(func11.call(schema177.properties, key0))){
const err10 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.id !== undefined){
let data0 = data.id;
if(typeof data0 === "string"){
if(func1(data0) < 1){
const err11 = {instancePath:instancePath+"/id",schemaPath:"gamo#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
else {
const err12 = {instancePath:instancePath+"/id",schemaPath:"gamo#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.number !== undefined){
let data1 = data.number;
if(typeof data1 === "string"){
if(!pattern5.test(data1)){
const err13 = {instancePath:instancePath+"/number",schemaPath:"#/properties/number/pattern",keyword:"pattern",params:{pattern: "^GS-[0-9]{4}-[0-9]{4,}$"},message:"must match pattern \""+"^GS-[0-9]{4}-[0-9]{4,}$"+"\""};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
else {
const err14 = {instancePath:instancePath+"/number",schemaPath:"#/properties/number/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.sourceType !== undefined){
let data2 = data.sourceType;
if(typeof data2 !== "string"){
const err15 = {instancePath:instancePath+"/sourceType",schemaPath:"#/properties/sourceType/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if(!(((data2 === "service_request") || (data2 === "academy_registration")) || (data2 === "manual"))){
const err16 = {instancePath:instancePath+"/sourceType",schemaPath:"#/properties/sourceType/enum",keyword:"enum",params:{allowedValues: schema177.properties.sourceType.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data.sourceId !== undefined){
let data3 = data.sourceId;
if((typeof data3 !== "string") && (data3 !== null)){
const err17 = {instancePath:instancePath+"/sourceId",schemaPath:"#/properties/sourceId/type",keyword:"type",params:{type: schema177.properties.sourceId.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data.billToName !== undefined){
if(typeof data.billToName !== "string"){
const err18 = {instancePath:instancePath+"/billToName",schemaPath:"#/properties/billToName/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.billToEmail !== undefined){
let data5 = data.billToEmail;
if(typeof data5 === "string"){
if(!(formats6.test(data5))){
const err19 = {instancePath:instancePath+"/billToEmail",schemaPath:"#/properties/billToEmail/format",keyword:"format",params:{format: "email"},message:"must match format \""+"email"+"\""};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
else {
const err20 = {instancePath:instancePath+"/billToEmail",schemaPath:"#/properties/billToEmail/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
if(data.status !== undefined){
let data6 = data.status;
if(typeof data6 !== "string"){
const err21 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
if(!((((data6 === "draft") || (data6 === "open")) || (data6 === "paid")) || (data6 === "void"))){
const err22 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/enum",keyword:"enum",params:{allowedValues: schema177.properties.status.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
if(data.currency !== undefined){
if("usd" !== data.currency){
const err23 = {instancePath:instancePath+"/currency",schemaPath:"#/properties/currency/const",keyword:"const",params:{allowedValue: "usd"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
if(data.totalCents !== undefined){
let data8 = data.totalCents;
if(!((typeof data8 == "number") && (!(data8 % 1) && !isNaN(data8)))){
const err24 = {instancePath:instancePath+"/totalCents",schemaPath:"#/properties/totalCents/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
if(typeof data8 == "number"){
if(data8 < 0 || isNaN(data8)){
const err25 = {instancePath:instancePath+"/totalCents",schemaPath:"#/properties/totalCents/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
}
if(data.dueDate !== undefined){
let data9 = data.dueDate;
if((typeof data9 !== "string") && (data9 !== null)){
const err26 = {instancePath:instancePath+"/dueDate",schemaPath:"#/properties/dueDate/type",keyword:"type",params:{type: schema177.properties.dueDate.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
if(typeof data9 === "string"){
if(!(formats68.validate(data9))){
const err27 = {instancePath:instancePath+"/dueDate",schemaPath:"#/properties/dueDate/format",keyword:"format",params:{format: "date"},message:"must match format \""+"date"+"\""};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
}
if(data.stripeInvoiceId !== undefined){
let data10 = data.stripeInvoiceId;
if((typeof data10 !== "string") && (data10 !== null)){
const err28 = {instancePath:instancePath+"/stripeInvoiceId",schemaPath:"#/properties/stripeInvoiceId/type",keyword:"type",params:{type: schema177.properties.stripeInvoiceId.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
if(data.hostedUrl !== undefined){
let data11 = data.hostedUrl;
if((typeof data11 !== "string") && (data11 !== null)){
const err29 = {instancePath:instancePath+"/hostedUrl",schemaPath:"#/properties/hostedUrl/type",keyword:"type",params:{type: schema177.properties.hostedUrl.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
if(typeof data11 === "string"){
if(!(formats70(data11))){
const err30 = {instancePath:instancePath+"/hostedUrl",schemaPath:"#/properties/hostedUrl/format",keyword:"format",params:{format: "uri"},message:"must match format \""+"uri"+"\""};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
}
if(data.paidAt !== undefined){
let data12 = data.paidAt;
const _errs27 = errors;
let valid2 = false;
let passing0 = null;
const _errs28 = errors;
if(typeof data12 === "string"){
if(!(formats0.validate(data12))){
const err31 = {instancePath:instancePath+"/paidAt",schemaPath:"gamo#/components/schemas/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
else {
const err32 = {instancePath:instancePath+"/paidAt",schemaPath:"gamo#/components/schemas/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
var _valid0 = _errs28 === errors;
if(_valid0){
valid2 = true;
passing0 = 0;
}
const _errs31 = errors;
if(data12 !== null){
const err33 = {instancePath:instancePath+"/paidAt",schemaPath:"#/properties/paidAt/oneOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
var _valid0 = _errs31 === errors;
if(_valid0 && valid2){
valid2 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid2 = true;
passing0 = 1;
}
}
if(!valid2){
const err34 = {instancePath:instancePath+"/paidAt",schemaPath:"#/properties/paidAt/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
else {
errors = _errs27;
if(vErrors !== null){
if(_errs27){
vErrors.length = _errs27;
}
else {
vErrors = null;
}
}
}
}
if(data.paidMethod !== undefined){
let data13 = data.paidMethod;
const _errs34 = errors;
let valid4 = false;
let passing1 = null;
const _errs35 = errors;
if(typeof data13 !== "string"){
const err35 = {instancePath:instancePath+"/paidMethod",schemaPath:"gamo#/components/schemas/PaymentMethod/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
if(!((((((data13 === "stripe") || (data13 === "check")) || (data13 === "zelle")) || (data13 === "ach")) || (data13 === "cash")) || (data13 === "other"))){
const err36 = {instancePath:instancePath+"/paidMethod",schemaPath:"gamo#/components/schemas/PaymentMethod/enum",keyword:"enum",params:{allowedValues: schema180.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
var _valid1 = _errs35 === errors;
if(_valid1){
valid4 = true;
passing1 = 0;
}
const _errs38 = errors;
if(data13 !== null){
const err37 = {instancePath:instancePath+"/paidMethod",schemaPath:"#/properties/paidMethod/oneOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
var _valid1 = _errs38 === errors;
if(_valid1 && valid4){
valid4 = false;
passing1 = [passing1, 1];
}
else {
if(_valid1){
valid4 = true;
passing1 = 1;
}
}
if(!valid4){
const err38 = {instancePath:instancePath+"/paidMethod",schemaPath:"#/properties/paidMethod/oneOf",keyword:"oneOf",params:{passingSchemas: passing1},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
else {
errors = _errs34;
if(vErrors !== null){
if(_errs34){
vErrors.length = _errs34;
}
else {
vErrors = null;
}
}
}
}
if(data.paidReference !== undefined){
let data14 = data.paidReference;
if((typeof data14 !== "string") && (data14 !== null)){
const err39 = {instancePath:instancePath+"/paidReference",schemaPath:"#/properties/paidReference/type",keyword:"type",params:{type: schema177.properties.paidReference.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
if(data.lines !== undefined){
let data15 = data.lines;
if(Array.isArray(data15)){
const len0 = data15.length;
for(let i0=0; i0<len0; i0++){
if(!(validate86(data15[i0], {instancePath:instancePath+"/lines/" + i0,parentData:data15,parentDataProperty:i0,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate86.errors : vErrors.concat(validate86.errors);
errors = vErrors.length;
}
}
}
else {
const err40 = {instancePath:instancePath+"/lines",schemaPath:"#/properties/lines/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
}
if(data.createdAt !== undefined){
let data17 = data.createdAt;
if(typeof data17 === "string"){
if(!(formats0.validate(data17))){
const err41 = {instancePath:instancePath+"/createdAt",schemaPath:"gamo#/components/schemas/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
}
else {
const err42 = {instancePath:instancePath+"/createdAt",schemaPath:"gamo#/components/schemas/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
}
}
else {
const err43 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
validate85.errors = vErrors;
return errors === 0;
}
validate85.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_CreateInvoiceInput = validate88;
const schema187 = {"$id":"schema_CreateInvoiceInput","type":"object","additionalProperties":false,"properties":{"sourceType":{"type":"string","enum":["service_request","academy_registration","manual"]},"sourceId":{"type":"string","description":"Service request or academy registration id; omit for manual invoices."},"billToName":{"type":"string","minLength":1,"maxLength":200},"billToEmail":{"type":"string","format":"email"},"dueDate":{"type":"string","format":"date"},"lines":{"type":"array","minItems":1,"maxItems":50,"description":"When omitted for a service_request source, lines are prefilled from accepted offers.","items":{"type":"object","additionalProperties":false,"properties":{"kind":{"$ref":"gamo#/components/schemas/InvoiceLineKind"},"description":{"type":"string","minLength":1,"maxLength":500},"quantity":{"type":"integer","minimum":1,"default":1},"unitAmountCents":{"type":"integer","minimum":0},"payeeRosterMemberId":{"$ref":"gamo#/components/schemas/Identifier"}},"required":["kind","description","unitAmountCents"]}}},"required":["sourceType","billToName","billToEmail"]};

function validate88(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_CreateInvoiceInput" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate88.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.sourceType === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "sourceType"},message:"must have required property '"+"sourceType"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.billToName === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "billToName"},message:"must have required property '"+"billToName"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.billToEmail === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "billToEmail"},message:"must have required property '"+"billToEmail"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
for(const key0 in data){
if(!((((((key0 === "sourceType") || (key0 === "sourceId")) || (key0 === "billToName")) || (key0 === "billToEmail")) || (key0 === "dueDate")) || (key0 === "lines"))){
const err3 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.sourceType !== undefined){
let data0 = data.sourceType;
if(typeof data0 !== "string"){
const err4 = {instancePath:instancePath+"/sourceType",schemaPath:"#/properties/sourceType/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(!(((data0 === "service_request") || (data0 === "academy_registration")) || (data0 === "manual"))){
const err5 = {instancePath:instancePath+"/sourceType",schemaPath:"#/properties/sourceType/enum",keyword:"enum",params:{allowedValues: schema187.properties.sourceType.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.sourceId !== undefined){
if(typeof data.sourceId !== "string"){
const err6 = {instancePath:instancePath+"/sourceId",schemaPath:"#/properties/sourceId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.billToName !== undefined){
let data2 = data.billToName;
if(typeof data2 === "string"){
if(func1(data2) > 200){
const err7 = {instancePath:instancePath+"/billToName",schemaPath:"#/properties/billToName/maxLength",keyword:"maxLength",params:{limit: 200},message:"must NOT have more than 200 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(func1(data2) < 1){
const err8 = {instancePath:instancePath+"/billToName",schemaPath:"#/properties/billToName/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
else {
const err9 = {instancePath:instancePath+"/billToName",schemaPath:"#/properties/billToName/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.billToEmail !== undefined){
let data3 = data.billToEmail;
if(typeof data3 === "string"){
if(!(formats6.test(data3))){
const err10 = {instancePath:instancePath+"/billToEmail",schemaPath:"#/properties/billToEmail/format",keyword:"format",params:{format: "email"},message:"must match format \""+"email"+"\""};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
else {
const err11 = {instancePath:instancePath+"/billToEmail",schemaPath:"#/properties/billToEmail/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.dueDate !== undefined){
let data4 = data.dueDate;
if(typeof data4 === "string"){
if(!(formats68.validate(data4))){
const err12 = {instancePath:instancePath+"/dueDate",schemaPath:"#/properties/dueDate/format",keyword:"format",params:{format: "date"},message:"must match format \""+"date"+"\""};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
else {
const err13 = {instancePath:instancePath+"/dueDate",schemaPath:"#/properties/dueDate/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.lines !== undefined){
let data5 = data.lines;
if(Array.isArray(data5)){
if(data5.length > 50){
const err14 = {instancePath:instancePath+"/lines",schemaPath:"#/properties/lines/maxItems",keyword:"maxItems",params:{limit: 50},message:"must NOT have more than 50 items"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(data5.length < 1){
const err15 = {instancePath:instancePath+"/lines",schemaPath:"#/properties/lines/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
const len0 = data5.length;
for(let i0=0; i0<len0; i0++){
let data6 = data5[i0];
if(data6 && typeof data6 == "object" && !Array.isArray(data6)){
if(data6.kind === undefined){
const err16 = {instancePath:instancePath+"/lines/" + i0,schemaPath:"#/properties/lines/items/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if(data6.description === undefined){
const err17 = {instancePath:instancePath+"/lines/" + i0,schemaPath:"#/properties/lines/items/required",keyword:"required",params:{missingProperty: "description"},message:"must have required property '"+"description"+"'"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if(data6.unitAmountCents === undefined){
const err18 = {instancePath:instancePath+"/lines/" + i0,schemaPath:"#/properties/lines/items/required",keyword:"required",params:{missingProperty: "unitAmountCents"},message:"must have required property '"+"unitAmountCents"+"'"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
for(const key1 in data6){
if(!(((((key1 === "kind") || (key1 === "description")) || (key1 === "quantity")) || (key1 === "unitAmountCents")) || (key1 === "payeeRosterMemberId"))){
const err19 = {instancePath:instancePath+"/lines/" + i0,schemaPath:"#/properties/lines/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
if(data6.kind !== undefined){
let data7 = data6.kind;
if(typeof data7 !== "string"){
const err20 = {instancePath:instancePath+"/lines/" + i0+"/kind",schemaPath:"gamo#/components/schemas/InvoiceLineKind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
if(!(((((data7 === "musician_pay") || (data7 === "lesson")) || (data7 === "production")) || (data7 === "other")) || (data7 === "gamo_admin"))){
const err21 = {instancePath:instancePath+"/lines/" + i0+"/kind",schemaPath:"gamo#/components/schemas/InvoiceLineKind/enum",keyword:"enum",params:{allowedValues: schema174.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data6.description !== undefined){
let data8 = data6.description;
if(typeof data8 === "string"){
if(func1(data8) > 500){
const err22 = {instancePath:instancePath+"/lines/" + i0+"/description",schemaPath:"#/properties/lines/items/properties/description/maxLength",keyword:"maxLength",params:{limit: 500},message:"must NOT have more than 500 characters"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
if(func1(data8) < 1){
const err23 = {instancePath:instancePath+"/lines/" + i0+"/description",schemaPath:"#/properties/lines/items/properties/description/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
else {
const err24 = {instancePath:instancePath+"/lines/" + i0+"/description",schemaPath:"#/properties/lines/items/properties/description/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
if(data6.quantity !== undefined){
let data9 = data6.quantity;
if(!((typeof data9 == "number") && (!(data9 % 1) && !isNaN(data9)))){
const err25 = {instancePath:instancePath+"/lines/" + i0+"/quantity",schemaPath:"#/properties/lines/items/properties/quantity/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
if(typeof data9 == "number"){
if(data9 < 1 || isNaN(data9)){
const err26 = {instancePath:instancePath+"/lines/" + i0+"/quantity",schemaPath:"#/properties/lines/items/properties/quantity/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
}
if(data6.unitAmountCents !== undefined){
let data10 = data6.unitAmountCents;
if(!((typeof data10 == "number") && (!(data10 % 1) && !isNaN(data10)))){
const err27 = {instancePath:instancePath+"/lines/" + i0+"/unitAmountCents",schemaPath:"#/properties/lines/items/properties/unitAmountCents/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
if(typeof data10 == "number"){
if(data10 < 0 || isNaN(data10)){
const err28 = {instancePath:instancePath+"/lines/" + i0+"/unitAmountCents",schemaPath:"#/properties/lines/items/properties/unitAmountCents/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
}
if(data6.payeeRosterMemberId !== undefined){
let data11 = data6.payeeRosterMemberId;
if(typeof data11 === "string"){
if(func1(data11) < 1){
const err29 = {instancePath:instancePath+"/lines/" + i0+"/payeeRosterMemberId",schemaPath:"gamo#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
else {
const err30 = {instancePath:instancePath+"/lines/" + i0+"/payeeRosterMemberId",schemaPath:"gamo#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
}
else {
const err31 = {instancePath:instancePath+"/lines/" + i0,schemaPath:"#/properties/lines/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
}
else {
const err32 = {instancePath:instancePath+"/lines",schemaPath:"#/properties/lines/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
}
else {
const err33 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
validate88.errors = vErrors;
return errors === 0;
}
validate88.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_InvoiceResponse = validate89;
const schema190 = {"$id":"schema_InvoiceResponse","type":"object","additionalProperties":false,"properties":{"success":{"const":true},"data":{"$ref":"gamo#/components/schemas/Invoice"}},"required":["success","data"]};
const schema191 = {"type":"object","additionalProperties":false,"properties":{"id":{"$ref":"#/components/schemas/Identifier"},"number":{"type":"string","pattern":"^GS-[0-9]{4}-[0-9]{4,}$","description":"Sequential per year, e.g. GS-2026-0001."},"sourceType":{"type":"string","enum":["service_request","academy_registration","manual"]},"sourceId":{"type":["string","null"]},"billToName":{"type":"string"},"billToEmail":{"type":"string","format":"email"},"status":{"type":"string","enum":["draft","open","paid","void"]},"currency":{"const":"usd"},"totalCents":{"type":"integer","minimum":0},"dueDate":{"type":["string","null"],"format":"date"},"stripeInvoiceId":{"type":["string","null"]},"hostedUrl":{"type":["string","null"],"format":"uri"},"paidAt":{"oneOf":[{"$ref":"#/components/schemas/Timestamp"},{"type":"null"}]},"paidMethod":{"oneOf":[{"$ref":"#/components/schemas/PaymentMethod"},{"type":"null"}]},"paidReference":{"type":["string","null"]},"lines":{"type":"array","items":{"$ref":"#/components/schemas/InvoiceLine"}},"createdAt":{"$ref":"#/components/schemas/Timestamp"}},"required":["id","number","sourceType","billToName","billToEmail","status","currency","totalCents","lines","createdAt"]};

function validate91(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate91.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.kind === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.description === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "description"},message:"must have required property '"+"description"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.quantity === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "quantity"},message:"must have required property '"+"quantity"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.unitAmountCents === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "unitAmountCents"},message:"must have required property '"+"unitAmountCents"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.amountCents === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "amountCents"},message:"must have required property '"+"amountCents"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
for(const key0 in data){
if(!((((((((key0 === "id") || (key0 === "kind")) || (key0 === "description")) || (key0 === "quantity")) || (key0 === "unitAmountCents")) || (key0 === "amountCents")) || (key0 === "payeeRosterMemberId")) || (key0 === "payoutRecordedAt"))){
const err6 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.id !== undefined){
let data0 = data.id;
if(typeof data0 === "string"){
if(func1(data0) < 1){
const err7 = {instancePath:instancePath+"/id",schemaPath:"#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/id",schemaPath:"#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.kind !== undefined){
let data1 = data.kind;
if(typeof data1 !== "string"){
const err9 = {instancePath:instancePath+"/kind",schemaPath:"#/components/schemas/InvoiceLineKind/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(!(((((data1 === "musician_pay") || (data1 === "lesson")) || (data1 === "production")) || (data1 === "other")) || (data1 === "gamo_admin"))){
const err10 = {instancePath:instancePath+"/kind",schemaPath:"#/components/schemas/InvoiceLineKind/enum",keyword:"enum",params:{allowedValues: schema174.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.description !== undefined){
if(typeof data.description !== "string"){
const err11 = {instancePath:instancePath+"/description",schemaPath:"#/properties/description/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.quantity !== undefined){
let data3 = data.quantity;
if(!((typeof data3 == "number") && (!(data3 % 1) && !isNaN(data3)))){
const err12 = {instancePath:instancePath+"/quantity",schemaPath:"#/properties/quantity/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(typeof data3 == "number"){
if(data3 < 1 || isNaN(data3)){
const err13 = {instancePath:instancePath+"/quantity",schemaPath:"#/properties/quantity/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
}
if(data.unitAmountCents !== undefined){
let data4 = data.unitAmountCents;
if(!((typeof data4 == "number") && (!(data4 % 1) && !isNaN(data4)))){
const err14 = {instancePath:instancePath+"/unitAmountCents",schemaPath:"#/properties/unitAmountCents/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(typeof data4 == "number"){
if(data4 < 0 || isNaN(data4)){
const err15 = {instancePath:instancePath+"/unitAmountCents",schemaPath:"#/properties/unitAmountCents/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
}
if(data.amountCents !== undefined){
let data5 = data.amountCents;
if(!((typeof data5 == "number") && (!(data5 % 1) && !isNaN(data5)))){
const err16 = {instancePath:instancePath+"/amountCents",schemaPath:"#/properties/amountCents/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if(typeof data5 == "number"){
if(data5 < 0 || isNaN(data5)){
const err17 = {instancePath:instancePath+"/amountCents",schemaPath:"#/properties/amountCents/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
}
if(data.payeeRosterMemberId !== undefined){
let data6 = data.payeeRosterMemberId;
const _errs17 = errors;
let valid3 = false;
let passing0 = null;
const _errs18 = errors;
if(typeof data6 === "string"){
if(func1(data6) < 1){
const err18 = {instancePath:instancePath+"/payeeRosterMemberId",schemaPath:"#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
else {
const err19 = {instancePath:instancePath+"/payeeRosterMemberId",schemaPath:"#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
var _valid0 = _errs18 === errors;
if(_valid0){
valid3 = true;
passing0 = 0;
}
const _errs21 = errors;
if(data6 !== null){
const err20 = {instancePath:instancePath+"/payeeRosterMemberId",schemaPath:"#/properties/payeeRosterMemberId/oneOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
var _valid0 = _errs21 === errors;
if(_valid0 && valid3){
valid3 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid3 = true;
passing0 = 1;
}
}
if(!valid3){
const err21 = {instancePath:instancePath+"/payeeRosterMemberId",schemaPath:"#/properties/payeeRosterMemberId/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
else {
errors = _errs17;
if(vErrors !== null){
if(_errs17){
vErrors.length = _errs17;
}
else {
vErrors = null;
}
}
}
}
if(data.payoutRecordedAt !== undefined){
let data7 = data.payoutRecordedAt;
const _errs24 = errors;
let valid5 = false;
let passing1 = null;
const _errs25 = errors;
if(typeof data7 === "string"){
if(!(formats0.validate(data7))){
const err22 = {instancePath:instancePath+"/payoutRecordedAt",schemaPath:"#/components/schemas/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
else {
const err23 = {instancePath:instancePath+"/payoutRecordedAt",schemaPath:"#/components/schemas/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
var _valid1 = _errs25 === errors;
if(_valid1){
valid5 = true;
passing1 = 0;
}
const _errs28 = errors;
if(data7 !== null){
const err24 = {instancePath:instancePath+"/payoutRecordedAt",schemaPath:"#/properties/payoutRecordedAt/oneOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
var _valid1 = _errs28 === errors;
if(_valid1 && valid5){
valid5 = false;
passing1 = [passing1, 1];
}
else {
if(_valid1){
valid5 = true;
passing1 = 1;
}
}
if(!valid5){
const err25 = {instancePath:instancePath+"/payoutRecordedAt",schemaPath:"#/properties/payoutRecordedAt/oneOf",keyword:"oneOf",params:{passingSchemas: passing1},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
else {
errors = _errs24;
if(vErrors !== null){
if(_errs24){
vErrors.length = _errs24;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err26 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
validate91.errors = vErrors;
return errors === 0;
}
validate91.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate90(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate90.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.number === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "number"},message:"must have required property '"+"number"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.sourceType === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "sourceType"},message:"must have required property '"+"sourceType"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.billToName === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "billToName"},message:"must have required property '"+"billToName"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.billToEmail === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "billToEmail"},message:"must have required property '"+"billToEmail"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.status === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.currency === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "currency"},message:"must have required property '"+"currency"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.totalCents === undefined){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "totalCents"},message:"must have required property '"+"totalCents"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data.lines === undefined){
const err8 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "lines"},message:"must have required property '"+"lines"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(data.createdAt === undefined){
const err9 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "createdAt"},message:"must have required property '"+"createdAt"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
for(const key0 in data){
if(!(func11.call(schema191.properties, key0))){
const err10 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.id !== undefined){
let data0 = data.id;
if(typeof data0 === "string"){
if(func1(data0) < 1){
const err11 = {instancePath:instancePath+"/id",schemaPath:"#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
else {
const err12 = {instancePath:instancePath+"/id",schemaPath:"#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.number !== undefined){
let data1 = data.number;
if(typeof data1 === "string"){
if(!pattern5.test(data1)){
const err13 = {instancePath:instancePath+"/number",schemaPath:"#/properties/number/pattern",keyword:"pattern",params:{pattern: "^GS-[0-9]{4}-[0-9]{4,}$"},message:"must match pattern \""+"^GS-[0-9]{4}-[0-9]{4,}$"+"\""};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
else {
const err14 = {instancePath:instancePath+"/number",schemaPath:"#/properties/number/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.sourceType !== undefined){
let data2 = data.sourceType;
if(typeof data2 !== "string"){
const err15 = {instancePath:instancePath+"/sourceType",schemaPath:"#/properties/sourceType/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if(!(((data2 === "service_request") || (data2 === "academy_registration")) || (data2 === "manual"))){
const err16 = {instancePath:instancePath+"/sourceType",schemaPath:"#/properties/sourceType/enum",keyword:"enum",params:{allowedValues: schema191.properties.sourceType.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data.sourceId !== undefined){
let data3 = data.sourceId;
if((typeof data3 !== "string") && (data3 !== null)){
const err17 = {instancePath:instancePath+"/sourceId",schemaPath:"#/properties/sourceId/type",keyword:"type",params:{type: schema191.properties.sourceId.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data.billToName !== undefined){
if(typeof data.billToName !== "string"){
const err18 = {instancePath:instancePath+"/billToName",schemaPath:"#/properties/billToName/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.billToEmail !== undefined){
let data5 = data.billToEmail;
if(typeof data5 === "string"){
if(!(formats6.test(data5))){
const err19 = {instancePath:instancePath+"/billToEmail",schemaPath:"#/properties/billToEmail/format",keyword:"format",params:{format: "email"},message:"must match format \""+"email"+"\""};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
else {
const err20 = {instancePath:instancePath+"/billToEmail",schemaPath:"#/properties/billToEmail/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
if(data.status !== undefined){
let data6 = data.status;
if(typeof data6 !== "string"){
const err21 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
if(!((((data6 === "draft") || (data6 === "open")) || (data6 === "paid")) || (data6 === "void"))){
const err22 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/enum",keyword:"enum",params:{allowedValues: schema191.properties.status.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
if(data.currency !== undefined){
if("usd" !== data.currency){
const err23 = {instancePath:instancePath+"/currency",schemaPath:"#/properties/currency/const",keyword:"const",params:{allowedValue: "usd"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
if(data.totalCents !== undefined){
let data8 = data.totalCents;
if(!((typeof data8 == "number") && (!(data8 % 1) && !isNaN(data8)))){
const err24 = {instancePath:instancePath+"/totalCents",schemaPath:"#/properties/totalCents/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
if(typeof data8 == "number"){
if(data8 < 0 || isNaN(data8)){
const err25 = {instancePath:instancePath+"/totalCents",schemaPath:"#/properties/totalCents/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
}
if(data.dueDate !== undefined){
let data9 = data.dueDate;
if((typeof data9 !== "string") && (data9 !== null)){
const err26 = {instancePath:instancePath+"/dueDate",schemaPath:"#/properties/dueDate/type",keyword:"type",params:{type: schema191.properties.dueDate.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
if(typeof data9 === "string"){
if(!(formats68.validate(data9))){
const err27 = {instancePath:instancePath+"/dueDate",schemaPath:"#/properties/dueDate/format",keyword:"format",params:{format: "date"},message:"must match format \""+"date"+"\""};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
}
if(data.stripeInvoiceId !== undefined){
let data10 = data.stripeInvoiceId;
if((typeof data10 !== "string") && (data10 !== null)){
const err28 = {instancePath:instancePath+"/stripeInvoiceId",schemaPath:"#/properties/stripeInvoiceId/type",keyword:"type",params:{type: schema191.properties.stripeInvoiceId.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
if(data.hostedUrl !== undefined){
let data11 = data.hostedUrl;
if((typeof data11 !== "string") && (data11 !== null)){
const err29 = {instancePath:instancePath+"/hostedUrl",schemaPath:"#/properties/hostedUrl/type",keyword:"type",params:{type: schema191.properties.hostedUrl.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
if(typeof data11 === "string"){
if(!(formats70(data11))){
const err30 = {instancePath:instancePath+"/hostedUrl",schemaPath:"#/properties/hostedUrl/format",keyword:"format",params:{format: "uri"},message:"must match format \""+"uri"+"\""};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
}
if(data.paidAt !== undefined){
let data12 = data.paidAt;
const _errs27 = errors;
let valid2 = false;
let passing0 = null;
const _errs28 = errors;
if(typeof data12 === "string"){
if(!(formats0.validate(data12))){
const err31 = {instancePath:instancePath+"/paidAt",schemaPath:"#/components/schemas/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
else {
const err32 = {instancePath:instancePath+"/paidAt",schemaPath:"#/components/schemas/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
var _valid0 = _errs28 === errors;
if(_valid0){
valid2 = true;
passing0 = 0;
}
const _errs31 = errors;
if(data12 !== null){
const err33 = {instancePath:instancePath+"/paidAt",schemaPath:"#/properties/paidAt/oneOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
var _valid0 = _errs31 === errors;
if(_valid0 && valid2){
valid2 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid2 = true;
passing0 = 1;
}
}
if(!valid2){
const err34 = {instancePath:instancePath+"/paidAt",schemaPath:"#/properties/paidAt/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
else {
errors = _errs27;
if(vErrors !== null){
if(_errs27){
vErrors.length = _errs27;
}
else {
vErrors = null;
}
}
}
}
if(data.paidMethod !== undefined){
let data13 = data.paidMethod;
const _errs34 = errors;
let valid4 = false;
let passing1 = null;
const _errs35 = errors;
if(typeof data13 !== "string"){
const err35 = {instancePath:instancePath+"/paidMethod",schemaPath:"#/components/schemas/PaymentMethod/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
if(!((((((data13 === "stripe") || (data13 === "check")) || (data13 === "zelle")) || (data13 === "ach")) || (data13 === "cash")) || (data13 === "other"))){
const err36 = {instancePath:instancePath+"/paidMethod",schemaPath:"#/components/schemas/PaymentMethod/enum",keyword:"enum",params:{allowedValues: schema180.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
var _valid1 = _errs35 === errors;
if(_valid1){
valid4 = true;
passing1 = 0;
}
const _errs38 = errors;
if(data13 !== null){
const err37 = {instancePath:instancePath+"/paidMethod",schemaPath:"#/properties/paidMethod/oneOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
var _valid1 = _errs38 === errors;
if(_valid1 && valid4){
valid4 = false;
passing1 = [passing1, 1];
}
else {
if(_valid1){
valid4 = true;
passing1 = 1;
}
}
if(!valid4){
const err38 = {instancePath:instancePath+"/paidMethod",schemaPath:"#/properties/paidMethod/oneOf",keyword:"oneOf",params:{passingSchemas: passing1},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
else {
errors = _errs34;
if(vErrors !== null){
if(_errs34){
vErrors.length = _errs34;
}
else {
vErrors = null;
}
}
}
}
if(data.paidReference !== undefined){
let data14 = data.paidReference;
if((typeof data14 !== "string") && (data14 !== null)){
const err39 = {instancePath:instancePath+"/paidReference",schemaPath:"#/properties/paidReference/type",keyword:"type",params:{type: schema191.properties.paidReference.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
if(data.lines !== undefined){
let data15 = data.lines;
if(Array.isArray(data15)){
const len0 = data15.length;
for(let i0=0; i0<len0; i0++){
if(!(validate91(data15[i0], {instancePath:instancePath+"/lines/" + i0,parentData:data15,parentDataProperty:i0,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate91.errors : vErrors.concat(validate91.errors);
errors = vErrors.length;
}
}
}
else {
const err40 = {instancePath:instancePath+"/lines",schemaPath:"#/properties/lines/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
}
if(data.createdAt !== undefined){
let data17 = data.createdAt;
if(typeof data17 === "string"){
if(!(formats0.validate(data17))){
const err41 = {instancePath:instancePath+"/createdAt",schemaPath:"#/components/schemas/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
}
else {
const err42 = {instancePath:instancePath+"/createdAt",schemaPath:"#/components/schemas/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
}
}
else {
const err43 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
validate90.errors = vErrors;
return errors === 0;
}
validate90.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate89(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_InvoiceResponse" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate89.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.success === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "success"},message:"must have required property '"+"success"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.data === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "data"},message:"must have required property '"+"data"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "success") || (key0 === "data"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.success !== undefined){
if(true !== data.success){
const err3 = {instancePath:instancePath+"/success",schemaPath:"#/properties/success/const",keyword:"const",params:{allowedValue: true},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.data !== undefined){
if(!(validate90(data.data, {instancePath:instancePath+"/data",parentData:data,parentDataProperty:"data",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate90.errors : vErrors.concat(validate90.errors);
errors = vErrors.length;
}
}
}
else {
const err4 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
validate89.errors = vErrors;
return errors === 0;
}
validate89.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_InvoiceListResponse = validate94;
const schema201 = {"$id":"schema_InvoiceListResponse","type":"object","additionalProperties":false,"properties":{"success":{"const":true},"data":{"type":"array","items":{"$ref":"gamo#/components/schemas/Invoice"}},"meta":{"$ref":"gamo#/components/schemas/CursorMeta"}},"required":["success","data"]};

function validate95(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate95.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.number === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "number"},message:"must have required property '"+"number"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.sourceType === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "sourceType"},message:"must have required property '"+"sourceType"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.billToName === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "billToName"},message:"must have required property '"+"billToName"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.billToEmail === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "billToEmail"},message:"must have required property '"+"billToEmail"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.status === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.currency === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "currency"},message:"must have required property '"+"currency"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.totalCents === undefined){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "totalCents"},message:"must have required property '"+"totalCents"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data.lines === undefined){
const err8 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "lines"},message:"must have required property '"+"lines"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(data.createdAt === undefined){
const err9 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "createdAt"},message:"must have required property '"+"createdAt"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
for(const key0 in data){
if(!(func11.call(schema191.properties, key0))){
const err10 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.id !== undefined){
let data0 = data.id;
if(typeof data0 === "string"){
if(func1(data0) < 1){
const err11 = {instancePath:instancePath+"/id",schemaPath:"#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
else {
const err12 = {instancePath:instancePath+"/id",schemaPath:"#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.number !== undefined){
let data1 = data.number;
if(typeof data1 === "string"){
if(!pattern5.test(data1)){
const err13 = {instancePath:instancePath+"/number",schemaPath:"#/properties/number/pattern",keyword:"pattern",params:{pattern: "^GS-[0-9]{4}-[0-9]{4,}$"},message:"must match pattern \""+"^GS-[0-9]{4}-[0-9]{4,}$"+"\""};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
else {
const err14 = {instancePath:instancePath+"/number",schemaPath:"#/properties/number/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.sourceType !== undefined){
let data2 = data.sourceType;
if(typeof data2 !== "string"){
const err15 = {instancePath:instancePath+"/sourceType",schemaPath:"#/properties/sourceType/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if(!(((data2 === "service_request") || (data2 === "academy_registration")) || (data2 === "manual"))){
const err16 = {instancePath:instancePath+"/sourceType",schemaPath:"#/properties/sourceType/enum",keyword:"enum",params:{allowedValues: schema191.properties.sourceType.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data.sourceId !== undefined){
let data3 = data.sourceId;
if((typeof data3 !== "string") && (data3 !== null)){
const err17 = {instancePath:instancePath+"/sourceId",schemaPath:"#/properties/sourceId/type",keyword:"type",params:{type: schema191.properties.sourceId.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data.billToName !== undefined){
if(typeof data.billToName !== "string"){
const err18 = {instancePath:instancePath+"/billToName",schemaPath:"#/properties/billToName/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.billToEmail !== undefined){
let data5 = data.billToEmail;
if(typeof data5 === "string"){
if(!(formats6.test(data5))){
const err19 = {instancePath:instancePath+"/billToEmail",schemaPath:"#/properties/billToEmail/format",keyword:"format",params:{format: "email"},message:"must match format \""+"email"+"\""};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
else {
const err20 = {instancePath:instancePath+"/billToEmail",schemaPath:"#/properties/billToEmail/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
if(data.status !== undefined){
let data6 = data.status;
if(typeof data6 !== "string"){
const err21 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
if(!((((data6 === "draft") || (data6 === "open")) || (data6 === "paid")) || (data6 === "void"))){
const err22 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/enum",keyword:"enum",params:{allowedValues: schema191.properties.status.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
if(data.currency !== undefined){
if("usd" !== data.currency){
const err23 = {instancePath:instancePath+"/currency",schemaPath:"#/properties/currency/const",keyword:"const",params:{allowedValue: "usd"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
if(data.totalCents !== undefined){
let data8 = data.totalCents;
if(!((typeof data8 == "number") && (!(data8 % 1) && !isNaN(data8)))){
const err24 = {instancePath:instancePath+"/totalCents",schemaPath:"#/properties/totalCents/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
if(typeof data8 == "number"){
if(data8 < 0 || isNaN(data8)){
const err25 = {instancePath:instancePath+"/totalCents",schemaPath:"#/properties/totalCents/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
}
if(data.dueDate !== undefined){
let data9 = data.dueDate;
if((typeof data9 !== "string") && (data9 !== null)){
const err26 = {instancePath:instancePath+"/dueDate",schemaPath:"#/properties/dueDate/type",keyword:"type",params:{type: schema191.properties.dueDate.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
if(typeof data9 === "string"){
if(!(formats68.validate(data9))){
const err27 = {instancePath:instancePath+"/dueDate",schemaPath:"#/properties/dueDate/format",keyword:"format",params:{format: "date"},message:"must match format \""+"date"+"\""};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
}
if(data.stripeInvoiceId !== undefined){
let data10 = data.stripeInvoiceId;
if((typeof data10 !== "string") && (data10 !== null)){
const err28 = {instancePath:instancePath+"/stripeInvoiceId",schemaPath:"#/properties/stripeInvoiceId/type",keyword:"type",params:{type: schema191.properties.stripeInvoiceId.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
if(data.hostedUrl !== undefined){
let data11 = data.hostedUrl;
if((typeof data11 !== "string") && (data11 !== null)){
const err29 = {instancePath:instancePath+"/hostedUrl",schemaPath:"#/properties/hostedUrl/type",keyword:"type",params:{type: schema191.properties.hostedUrl.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
if(typeof data11 === "string"){
if(!(formats70(data11))){
const err30 = {instancePath:instancePath+"/hostedUrl",schemaPath:"#/properties/hostedUrl/format",keyword:"format",params:{format: "uri"},message:"must match format \""+"uri"+"\""};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
}
if(data.paidAt !== undefined){
let data12 = data.paidAt;
const _errs27 = errors;
let valid2 = false;
let passing0 = null;
const _errs28 = errors;
if(typeof data12 === "string"){
if(!(formats0.validate(data12))){
const err31 = {instancePath:instancePath+"/paidAt",schemaPath:"#/components/schemas/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
else {
const err32 = {instancePath:instancePath+"/paidAt",schemaPath:"#/components/schemas/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
var _valid0 = _errs28 === errors;
if(_valid0){
valid2 = true;
passing0 = 0;
}
const _errs31 = errors;
if(data12 !== null){
const err33 = {instancePath:instancePath+"/paidAt",schemaPath:"#/properties/paidAt/oneOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
var _valid0 = _errs31 === errors;
if(_valid0 && valid2){
valid2 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid2 = true;
passing0 = 1;
}
}
if(!valid2){
const err34 = {instancePath:instancePath+"/paidAt",schemaPath:"#/properties/paidAt/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
else {
errors = _errs27;
if(vErrors !== null){
if(_errs27){
vErrors.length = _errs27;
}
else {
vErrors = null;
}
}
}
}
if(data.paidMethod !== undefined){
let data13 = data.paidMethod;
const _errs34 = errors;
let valid4 = false;
let passing1 = null;
const _errs35 = errors;
if(typeof data13 !== "string"){
const err35 = {instancePath:instancePath+"/paidMethod",schemaPath:"#/components/schemas/PaymentMethod/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
if(!((((((data13 === "stripe") || (data13 === "check")) || (data13 === "zelle")) || (data13 === "ach")) || (data13 === "cash")) || (data13 === "other"))){
const err36 = {instancePath:instancePath+"/paidMethod",schemaPath:"#/components/schemas/PaymentMethod/enum",keyword:"enum",params:{allowedValues: schema180.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
var _valid1 = _errs35 === errors;
if(_valid1){
valid4 = true;
passing1 = 0;
}
const _errs38 = errors;
if(data13 !== null){
const err37 = {instancePath:instancePath+"/paidMethod",schemaPath:"#/properties/paidMethod/oneOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
var _valid1 = _errs38 === errors;
if(_valid1 && valid4){
valid4 = false;
passing1 = [passing1, 1];
}
else {
if(_valid1){
valid4 = true;
passing1 = 1;
}
}
if(!valid4){
const err38 = {instancePath:instancePath+"/paidMethod",schemaPath:"#/properties/paidMethod/oneOf",keyword:"oneOf",params:{passingSchemas: passing1},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
else {
errors = _errs34;
if(vErrors !== null){
if(_errs34){
vErrors.length = _errs34;
}
else {
vErrors = null;
}
}
}
}
if(data.paidReference !== undefined){
let data14 = data.paidReference;
if((typeof data14 !== "string") && (data14 !== null)){
const err39 = {instancePath:instancePath+"/paidReference",schemaPath:"#/properties/paidReference/type",keyword:"type",params:{type: schema191.properties.paidReference.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
if(data.lines !== undefined){
let data15 = data.lines;
if(Array.isArray(data15)){
const len0 = data15.length;
for(let i0=0; i0<len0; i0++){
if(!(validate91(data15[i0], {instancePath:instancePath+"/lines/" + i0,parentData:data15,parentDataProperty:i0,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate91.errors : vErrors.concat(validate91.errors);
errors = vErrors.length;
}
}
}
else {
const err40 = {instancePath:instancePath+"/lines",schemaPath:"#/properties/lines/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
}
if(data.createdAt !== undefined){
let data17 = data.createdAt;
if(typeof data17 === "string"){
if(!(formats0.validate(data17))){
const err41 = {instancePath:instancePath+"/createdAt",schemaPath:"#/components/schemas/Timestamp/format",keyword:"format",params:{format: "date-time"},message:"must match format \""+"date-time"+"\""};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
}
else {
const err42 = {instancePath:instancePath+"/createdAt",schemaPath:"#/components/schemas/Timestamp/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
}
}
else {
const err43 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
validate95.errors = vErrors;
return errors === 0;
}
validate95.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate94(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_InvoiceListResponse" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate94.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.success === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "success"},message:"must have required property '"+"success"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.data === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "data"},message:"must have required property '"+"data"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!(((key0 === "success") || (key0 === "data")) || (key0 === "meta"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.success !== undefined){
if(true !== data.success){
const err3 = {instancePath:instancePath+"/success",schemaPath:"#/properties/success/const",keyword:"const",params:{allowedValue: true},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.data !== undefined){
let data1 = data.data;
if(Array.isArray(data1)){
const len0 = data1.length;
for(let i0=0; i0<len0; i0++){
if(!(validate95(data1[i0], {instancePath:instancePath+"/data/" + i0,parentData:data1,parentDataProperty:i0,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate95.errors : vErrors.concat(validate95.errors);
errors = vErrors.length;
}
}
}
else {
const err4 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.meta !== undefined){
let data3 = data.meta;
if(data3 && typeof data3 == "object" && !Array.isArray(data3)){
if(data3.nextCursor === undefined){
const err5 = {instancePath:instancePath+"/meta",schemaPath:"gamo#/components/schemas/CursorMeta/required",keyword:"required",params:{missingProperty: "nextCursor"},message:"must have required property '"+"nextCursor"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
for(const key1 in data3){
if(!(key1 === "nextCursor")){
const err6 = {instancePath:instancePath+"/meta",schemaPath:"gamo#/components/schemas/CursorMeta/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data3.nextCursor !== undefined){
let data4 = data3.nextCursor;
if((typeof data4 !== "string") && (data4 !== null)){
const err7 = {instancePath:instancePath+"/meta/nextCursor",schemaPath:"gamo#/components/schemas/CursorMeta/properties/nextCursor/type",keyword:"type",params:{type: schema121.properties.nextCursor.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
}
else {
const err8 = {instancePath:instancePath+"/meta",schemaPath:"gamo#/components/schemas/CursorMeta/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
}
else {
const err9 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
validate94.errors = vErrors;
return errors === 0;
}
validate94.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_SendInvoiceResponse = validate98;
const schema208 = {"$id":"schema_SendInvoiceResponse","type":"object","additionalProperties":false,"properties":{"success":{"const":true},"data":{"type":"object","additionalProperties":false,"properties":{"invoiceId":{"$ref":"gamo#/components/schemas/Identifier"},"mode":{"type":"string","enum":["stripe","manual"],"description":"stripe only with Stripe test credentials; otherwise manual instructions are emailed."},"hostedUrl":{"type":["string","null"],"format":"uri"},"status":{"const":"open"}},"required":["invoiceId","mode","status"]}},"required":["success","data"]};

function validate98(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_SendInvoiceResponse" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate98.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.success === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "success"},message:"must have required property '"+"success"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.data === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "data"},message:"must have required property '"+"data"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "success") || (key0 === "data"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.success !== undefined){
if(true !== data.success){
const err3 = {instancePath:instancePath+"/success",schemaPath:"#/properties/success/const",keyword:"const",params:{allowedValue: true},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.data !== undefined){
let data1 = data.data;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.invoiceId === undefined){
const err4 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/required",keyword:"required",params:{missingProperty: "invoiceId"},message:"must have required property '"+"invoiceId"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data1.mode === undefined){
const err5 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/required",keyword:"required",params:{missingProperty: "mode"},message:"must have required property '"+"mode"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data1.status === undefined){
const err6 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
for(const key1 in data1){
if(!((((key1 === "invoiceId") || (key1 === "mode")) || (key1 === "hostedUrl")) || (key1 === "status"))){
const err7 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data1.invoiceId !== undefined){
let data2 = data1.invoiceId;
if(typeof data2 === "string"){
if(func1(data2) < 1){
const err8 = {instancePath:instancePath+"/data/invoiceId",schemaPath:"gamo#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
else {
const err9 = {instancePath:instancePath+"/data/invoiceId",schemaPath:"gamo#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data1.mode !== undefined){
let data3 = data1.mode;
if(typeof data3 !== "string"){
const err10 = {instancePath:instancePath+"/data/mode",schemaPath:"#/properties/data/properties/mode/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(!((data3 === "stripe") || (data3 === "manual"))){
const err11 = {instancePath:instancePath+"/data/mode",schemaPath:"#/properties/data/properties/mode/enum",keyword:"enum",params:{allowedValues: schema208.properties.data.properties.mode.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data1.hostedUrl !== undefined){
let data4 = data1.hostedUrl;
if((typeof data4 !== "string") && (data4 !== null)){
const err12 = {instancePath:instancePath+"/data/hostedUrl",schemaPath:"#/properties/data/properties/hostedUrl/type",keyword:"type",params:{type: schema208.properties.data.properties.hostedUrl.type},message:"must be string,null"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(typeof data4 === "string"){
if(!(formats70(data4))){
const err13 = {instancePath:instancePath+"/data/hostedUrl",schemaPath:"#/properties/data/properties/hostedUrl/format",keyword:"format",params:{format: "uri"},message:"must match format \""+"uri"+"\""};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
}
if(data1.status !== undefined){
if("open" !== data1.status){
const err14 = {instancePath:instancePath+"/data/status",schemaPath:"#/properties/data/properties/status/const",keyword:"const",params:{allowedValue: "open"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
}
else {
const err15 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
}
else {
const err16 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
validate98.errors = vErrors;
return errors === 0;
}
validate98.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_MarkPaidInput = validate99;
const schema210 = {"$id":"schema_MarkPaidInput","type":"object","additionalProperties":false,"properties":{"method":{"$ref":"gamo#/components/schemas/PaymentMethod"},"reference":{"type":"string","maxLength":200}},"required":["method"]};

function validate99(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_MarkPaidInput" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate99.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.method === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "method"},message:"must have required property '"+"method"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "method") || (key0 === "reference"))){
const err1 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
if(data.method !== undefined){
let data0 = data.method;
if(typeof data0 !== "string"){
const err2 = {instancePath:instancePath+"/method",schemaPath:"gamo#/components/schemas/PaymentMethod/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(!((((((data0 === "stripe") || (data0 === "check")) || (data0 === "zelle")) || (data0 === "ach")) || (data0 === "cash")) || (data0 === "other"))){
const err3 = {instancePath:instancePath+"/method",schemaPath:"gamo#/components/schemas/PaymentMethod/enum",keyword:"enum",params:{allowedValues: schema180.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.reference !== undefined){
let data1 = data.reference;
if(typeof data1 === "string"){
if(func1(data1) > 200){
const err4 = {instancePath:instancePath+"/reference",schemaPath:"#/properties/reference/maxLength",keyword:"maxLength",params:{limit: 200},message:"must NOT have more than 200 characters"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
else {
const err5 = {instancePath:instancePath+"/reference",schemaPath:"#/properties/reference/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
}
else {
const err6 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
validate99.errors = vErrors;
return errors === 0;
}
validate99.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_RecordPayoutInput = validate100;
const schema212 = {"$id":"schema_RecordPayoutInput","type":"object","additionalProperties":false,"properties":{"method":{"$ref":"gamo#/components/schemas/PaymentMethod"},"reference":{"type":"string","maxLength":200}},"required":["method"]};

function validate100(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_RecordPayoutInput" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate100.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.method === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "method"},message:"must have required property '"+"method"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "method") || (key0 === "reference"))){
const err1 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
if(data.method !== undefined){
let data0 = data.method;
if(typeof data0 !== "string"){
const err2 = {instancePath:instancePath+"/method",schemaPath:"gamo#/components/schemas/PaymentMethod/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(!((((((data0 === "stripe") || (data0 === "check")) || (data0 === "zelle")) || (data0 === "ach")) || (data0 === "cash")) || (data0 === "other"))){
const err3 = {instancePath:instancePath+"/method",schemaPath:"gamo#/components/schemas/PaymentMethod/enum",keyword:"enum",params:{allowedValues: schema180.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.reference !== undefined){
let data1 = data.reference;
if(typeof data1 === "string"){
if(func1(data1) > 200){
const err4 = {instancePath:instancePath+"/reference",schemaPath:"#/properties/reference/maxLength",keyword:"maxLength",params:{limit: 200},message:"must NOT have more than 200 characters"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
else {
const err5 = {instancePath:instancePath+"/reference",schemaPath:"#/properties/reference/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
}
else {
const err6 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
validate100.errors = vErrors;
return errors === 0;
}
validate100.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_RecordPayoutResponse = validate101;
const schema214 = {"$id":"schema_RecordPayoutResponse","type":"object","additionalProperties":false,"properties":{"success":{"const":true},"data":{"type":"object","additionalProperties":false,"properties":{"payoutId":{"$ref":"gamo#/components/schemas/Identifier"},"invoiceLineId":{"$ref":"gamo#/components/schemas/Identifier"},"amountCents":{"type":"integer","minimum":0}},"required":["payoutId","invoiceLineId","amountCents"]}},"required":["success","data"]};

function validate101(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_RecordPayoutResponse" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate101.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.success === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "success"},message:"must have required property '"+"success"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.data === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "data"},message:"must have required property '"+"data"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "success") || (key0 === "data"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.success !== undefined){
if(true !== data.success){
const err3 = {instancePath:instancePath+"/success",schemaPath:"#/properties/success/const",keyword:"const",params:{allowedValue: true},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.data !== undefined){
let data1 = data.data;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.payoutId === undefined){
const err4 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/required",keyword:"required",params:{missingProperty: "payoutId"},message:"must have required property '"+"payoutId"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data1.invoiceLineId === undefined){
const err5 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/required",keyword:"required",params:{missingProperty: "invoiceLineId"},message:"must have required property '"+"invoiceLineId"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data1.amountCents === undefined){
const err6 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/required",keyword:"required",params:{missingProperty: "amountCents"},message:"must have required property '"+"amountCents"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
for(const key1 in data1){
if(!(((key1 === "payoutId") || (key1 === "invoiceLineId")) || (key1 === "amountCents"))){
const err7 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data1.payoutId !== undefined){
let data2 = data1.payoutId;
if(typeof data2 === "string"){
if(func1(data2) < 1){
const err8 = {instancePath:instancePath+"/data/payoutId",schemaPath:"gamo#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
else {
const err9 = {instancePath:instancePath+"/data/payoutId",schemaPath:"gamo#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data1.invoiceLineId !== undefined){
let data3 = data1.invoiceLineId;
if(typeof data3 === "string"){
if(func1(data3) < 1){
const err10 = {instancePath:instancePath+"/data/invoiceLineId",schemaPath:"gamo#/components/schemas/Identifier/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
else {
const err11 = {instancePath:instancePath+"/data/invoiceLineId",schemaPath:"gamo#/components/schemas/Identifier/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data1.amountCents !== undefined){
let data4 = data1.amountCents;
if(!((typeof data4 == "number") && (!(data4 % 1) && !isNaN(data4)))){
const err12 = {instancePath:instancePath+"/data/amountCents",schemaPath:"#/properties/data/properties/amountCents/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(typeof data4 == "number"){
if(data4 < 0 || isNaN(data4)){
const err13 = {instancePath:instancePath+"/data/amountCents",schemaPath:"#/properties/data/properties/amountCents/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
}
}
else {
const err14 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
}
else {
const err15 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
validate101.errors = vErrors;
return errors === 0;
}
validate101.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_StripeWebhookEvent = validate102;
const schema217 = {"$id":"schema_StripeWebhookEvent","type":"object","additionalProperties":true,"description":"Stripe event payload (signature-verified). Handled types: invoice.paid, invoice.payment_failed; any other type is acknowledged without change. livemode events are refused while live Stripe is not approved.","properties":{"id":{"type":"string"},"type":{"type":"string"},"livemode":{"type":"boolean"},"data":{"type":"object","additionalProperties":true}},"required":["id","type","data"]};

function validate102(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_StripeWebhookEvent" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate102.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.type === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.data === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "data"},message:"must have required property '"+"data"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.id !== undefined){
if(typeof data.id !== "string"){
const err3 = {instancePath:instancePath+"/id",schemaPath:"#/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.type !== undefined){
if(typeof data.type !== "string"){
const err4 = {instancePath:instancePath+"/type",schemaPath:"#/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.livemode !== undefined){
if(typeof data.livemode !== "boolean"){
const err5 = {instancePath:instancePath+"/livemode",schemaPath:"#/properties/livemode/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.data !== undefined){
let data3 = data.data;
if(data3 && typeof data3 == "object" && !Array.isArray(data3)){
}
else {
const err6 = {instancePath:instancePath+"/data",schemaPath:"#/properties/data/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
}
else {
const err7 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
validate102.errors = vErrors;
return errors === 0;
}
validate102.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const schema_StripeWebhookResponse = validate103;
const schema218 = {"$id":"schema_StripeWebhookResponse","type":"object","additionalProperties":false,"properties":{"received":{"const":true},"applied":{"type":"boolean"}},"required":["received","applied"]};

function validate103(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="schema_StripeWebhookResponse" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate103.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.received === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "received"},message:"must have required property '"+"received"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.applied === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "applied"},message:"must have required property '"+"applied"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "received") || (key0 === "applied"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.received !== undefined){
if(true !== data.received){
const err3 = {instancePath:instancePath+"/received",schemaPath:"#/properties/received/const",keyword:"const",params:{allowedValue: true},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.applied !== undefined){
if(typeof data.applied !== "boolean"){
const err4 = {instancePath:instancePath+"/applied",schemaPath:"#/properties/applied/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
}
else {
const err5 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
validate103.errors = vErrors;
return errors === 0;
}
validate103.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};
