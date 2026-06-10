
- [x] 1. **Database Migration** Currently the db for this site is separate from the container, now that a working version has been created, the database should be migrated to a pg db inside the container. Once this change is complete, there would be no need for nocodb to manage the db as well, so its connection could be severed.
- [x] 2. **Super users/admin**. There are already two types of users, lab members and farmers, both with different levels of access to the site, however, a system is needed to allow lab members to upload data from multiple farms. In the new system, lab members will also get a qr code for the FarmerDataLogger app, only when they submit data, it gets assigned to a farm via proximity to the farms fields, this way lab members can submit data for multiple farms. If data is uploaded by a lab member and it is not inside an existing field boundary, it remains in the lab members "map" tab until it is sorted (See sorting feature below). In order to allow lab members access to the dashboard, a credentials system needs to be sorted out. Open registration is not an option, so some secure method is needed to give account access to specific people.
- [x] 3. **Add Lab Member Data Upload Capability** Lab members will be able to upload data as well, that will not automatically be grouped to an individual farm. Instead, lab member uploaded data will be added to the db and displayed in one large table with the columns uploaded by", "assigned farm", "media type", "Date Collected" and "Status", allowing users to sort by each.
- [x] 4. **Add a "status" flag to all data uploaded by the FarmerDataLogger app.** This status will be coded as 1-4.  With 1 indicating no project specific linkage, (ie, uploaded by a lab member and the data is not inside or near (<1000 m from a farm polygon), 2 is at least linked to a farm either by spatial relationship or uploaded by a farmer. 3  is spatially located and manually assigned a category and description by a human or external AI workflow and requires the submitter to clarify information, 4 has been processed by human/ external AI workflow and is fully completed. 
- [x] 5.  **Data Sorting** A data sorting interaction ui is needed. This ui will only be accessible to those with lab member credentials. In the UI, users will be able to see all data uploaded by the FDL app either on a map or in a list where they can sort by date, farmer/lab member or status (as defined above). In this ui, the lab member can open each data set (image, text, voice recording etc.) and add a category, a description, and assign it to an experiment. Once the data is edited in the ui, its status is changed to 3.
- [x] 6. **Separate out access** Data upload url needs to be public and very secure to prevent bad actor access. All other access (UI, API) can remain on private address if possible. Alternatively, if the landing page of the ui can be adequately locked down with a secure access method and no way to register a new account from outside of the admin panel, both the ui and the upload url could be exposed
- [x] 7. **Dashboard Functionality Configuration** The dashboard UI needs some reconfiguring to improve workflow and functionality, changes are as follows:
	- [x] **Side Bar** The side menu in the panel needs to be reorganized, The Admin menu can be moved to the top and house "Contacts" (Change the label to "Farmers"), "Lab Members", "Data Uploads" "Data Sorting" and /"Dashboard". "Treatment Protocols" can get moved to Reference Data
	- [x] **Farm Page** The Farm page inside "Farms" (once the user clicks on a specific farm) Should show more info right away, including the leaflet map of the fields and experiment zones associated with the farm, farmer contact info and linked experiments. The "Fields", "Treatments", "Map" and "Experiment Zones"  tabs can be removed (since the info will be shown in the main farm page) so that there is just an "Overview" tab, "Contacts Tab", "Farmer Summary" (see bullet below) and a "Data Uploads Tab" for data that they uploaded from the mobile app shown on a separate map.
	- [x] **Farmer Summary Page** Once farmer interviews are processed, there will be a farmer summary document that highlights important information for the farm. This will be a markdown file uploaded via the client, so there should be a "Farm Info" tab that can display markdown. This will also require adding a "Farm Summary" field in the db table to store the farm summary data. 
- [ ] 8.  **Data Access Client** To facilitate efficient data processing workflows outside of the UI for scripts, ai assistants and lab members, I would like to build a CLI client that can interact with the database backend. This client could be downloaded and setup on a lab members computer, be given a client specific token (linked to the lab member, but identifiable as a client) and be used to access datasets via CLI commands. The cli would need to be bidirectional to allow for pulling unique identifiers from the db so that it could use proper convention when uploading files. for example, a command to upload field boundaries from a shapefile of geopackage to "Farmer brown" would use fuzzy matching to find the entry and unique id for "Farmer Brown" in the database, and then upload the data to the table fore Farmer Brown. Functions that should be available to the client:
	- [x] Create and edit Farm table
	- [x] Download and Upload Field boundaries to a specific Farm
	- [x] Download and Upload experimental zones to a specific Farm
	- [x] Download and upload mobile app data from farmers and lab members (separately)
	- [ ] Upload/download farm summary markdown
	- [ ] Pull and push items on the field work scheduling calendar (not implemented yet)
	
- [x] 9. **Experiment Info** Each farm page needs an "Experiments" tab (after "Farmer Summary") that contains information about their specific experiment(s). The data should be stored in two separate chunks; a Farmer assigned chunk called "Experiment Card", which contains the fields
	1. Experiment Name
	2. Start Date
	3. Hypothesis
	4. Experiment
	5. Measurements
	6. Criteria
	The second chunk is "Lab Design", which includes:
	7. Description
	8. Tests (multi drop down linked to Tests table. format is, select first test from drop down, then enter number of that test and expected collection date, then another drop down appears, this way the user can enter all applicable tests and the number of each sample) (Note. in the existing configuration, "N Samples" should be removed from the existing Tests table)
	9. Drone Flights (same format as above) Note: both forms should allow for duplicate entries of tests or drone flights, as long as the dates are different
	10. Treatments (multiselect from the Treatments table.)

- [x] 10. **File tree generation** 3. A file tree for the project is generated on box or an SMB share. Structured data from the Database will be stored there including a project info(ReadOnly).md that will be updated with data from the database, a project boundaries.gpkg file that stores all spatial data, and an Assets folder which contains all data uploaded via the FDL app. Test data or unstructured data will also be stored there and workflows will be developed to ingest and process the data will be developed over time. The file structure will be:
	Root/
		Projects
			Farms
				Farm Name
					Farmer Uploads
						Images
						Recordings
							Raw
							Markdown
						Notes
						GPS Tracks
						Documents
							Raw
							Markdown
					Consultant Uploads
						Images
						Recordings
						Notes
						GPS Tracks
					Experiment
						Experiment Card.md
						Project Summary.md
					Farm_Summary.md
					Spatial Data
						Boundaries.gpks (containing field and experiment zone areas)
					Tests 
						raw
							Soil_test_results.pdf
							Biomass_Datasheet.csv
						processed
							soil_test.csv
							biomass.csv
	
	
	The full file structure will be created when the sync client is run, regardless of whether all folders have data. Once the sync command is run, a validation methodology has to be developed to allow data to be pushed or pulled without everwriting changes.
- [ ] 11. **Field Work Scheduling** Admin should be able to schedule field work for specific farms and tests/drone flights in a calendar in the ui. This needs to be fleshed out more.
- [x] 12. **Upload Field Boundaries Button** In the farm page, there needs to be an upload field boundaries box that can handle shp files, geojson and geopackage inputs, as well as handling crs by having the user specify the epsg 
- [x] 13. **Spatial Processing Scripts** As it stands, there are a few tasks that must be done each time new spatial data is added. These tasks are:
	- [x] Total Area calculation to update dashboard number
	- [x] Field Matching for spatial data. check uploaded data against field boundaries to match to field or farm (field uses intersect match, if not in field, use 1000 m near distance matching to match to farm)
	
- [ ] 14. **Database cleanout** many files were uploaded during the development phase that were corrupted by changes or are no longer relavent, I need a temporary way to delete data from the db, including farms, files and fields
- [ ] 15. **Sort and filter for all table views**
- [x] 16. **Upload Data Button** There should be a data upload portal for unstructured data like pdfs, csvs and docx files. These should be uploaded either in a project page, or in a specific farm page and be assigned to the farm or project level. 
- [x] 17. **Link Farmer Name and other contact fields to Farmer info in Farmer Page** There should only be one farmer table, the existing farmers and contacts should be merged, and only one table carried forward, but the existing display of both the Farmers tab and the Farmer information in the Farms>farm menu should continue.

- [x] 18. **Three Tiered Administration System** There needs to be a hierarchy of administration levels for web ui users, with the highest level being able to delete any feature and activate an "Edit Mode" that allows tier 2 members to delete rows as well. Tier 2 members can add projects, farmers and farms, edit things that are currently editable, and delete things when Edit Mode is on. Lowest only able to categorize data uploads. Once this change is in place, Users and Lab members can be merged, and an admin panel made visible to tier 1 members that can designate other members admin level, and activate Edit Mode.
- [ ] 19. **Increase the Prominence of Experiment** Add Experiment to the Data Sorting Table and add an Experiments Tab to the "Field Operations" group that shows the experiment information from the experiment Tab in the Farms page. (all fields for now).
- [x] 20. **Merge Data Uploads and Data Sorting Tabs** 
- [x] 21. **Add a log out option** When the user clicks on their name in the top left corner, a small window pops up that lets the user log out. 
- [x] 22. **Data Upload Categories** To be added to data sorting catagories
	- [ ] Biomass sample
	- [ ] Grazing Measurement
	- [ ] Plant ID
	- [ ] Implement
	- [ ] Equipment Model Number
	- [ ] Chemical Label
	- [ ] Soil Sample
	- [ ] Pest/Disease
	- [ ] Harvest
	- [ ] Planting
	- [ ] Other
- [x] 23. **Remove data uploads page** (just data organization is needed, data uploads are still visible in farm page)
- [x] 24. **Overhaul of data organization** Instead of a pidly little side bar with a few fields, when a user clicks on a data item in the data sorting page, it should open a full page that shows all editable fields:
		* Farm
		* Project
		* Category
		* Status
		* Stage (explained below)
	and a map of where the data was collected (if it has spatial data).
	The page should also have next and previous buttons at the bottom, and the ability to filter which types of data will be advanced to, for example, if filtering by farm, the "Next" button will skip uploads that dont pertain to the selected farm, likewise for other fields. 
- [x] 25. **Change Site Name to FDL Dashboard**
- [x] 26. **Show Audio Recording Tracks instead of Dots** In the maps in data sorting data uploads, audio recordings show as a single dot where the recording started, but should show as a track/line feature.
- [ ] 27. **Permanently save image files** Currently, every time the dashboard restarts, images are lost, there needs to be a way to save them to the database permanently so that thumbnails and files are permanent.








### Usage Steps (Thinking out loud)
1. Adding a farm and their experiment
	1. Farmer contact info (simple form)
	2. field boundaries (uploaded via api)
	3. Experiment information (Form: Description(long text), link to experimental protocols (if applicable, multi checkbox dropdown))
	4. Test information ie, what we'll measure. (Form, multi check box to link tests/drones to the experiment)
	5. Farm Equipment info (simple form: Common name, model number, row width (if applicable), number of rows (if applicable), Acres per hour (if applicable)
2. Collecting Initial Field data through Farmer Data Logger (FDL App).
	1. Data is uploaded via app by the farmer (automatically assigned to the farm) OR. Data is uploaded by lab member or agronomist (must be assigned to farm via location data or manually by a lab member via the UI)
	2. All data is processed via human /AI classification
3. A file tree for the project is generated on box or an SMB share. Structured data from the Database will be stored there including a project info(ReadOnly).md that will be updated with data from the database, a project boundaries.gpkg file that stores all spatial data, and an Assets folder which contains all data uploaded via the FDL app. Test data or unstructured data will also be stored there and workflows will be developed to ingest and process the data will be developed over time. The file structure will be:
Root/
	Projects
		Farms
			Farmer Uploads
				Images
				Recordings
				Notes
				GPS Tracks
			Consultant Uploads
				Images
				Recordings
				Notes
				GPS Tracks
			Experiment
				Experiment Card.md
				Project Summary.md
			Farm_Summary.md
			Spatial Data
				Boundaries.gpks (containing field and experiment zone areas)
			Tests 
				Soil_test_results.pdf
				Biomass_Datasheet.csv
			


The full file structure will be created when the sync client is run, regardless of whether all folders have data. Once the sync command is run, a validation methodology has to be developed to allow data to be pushed or pulled without everwriting changes.